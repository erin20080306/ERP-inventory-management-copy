import { prisma } from "./prisma";
import { lockAndAssertAccountingPeriodOpen } from "./accounting-controls";

export type DocItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
};

export function calcTotals(items: DocItem[], isTaxable: boolean = true) {
  let subtotal = 0;
  let discount = 0;
  let taxAmount = 0;
  const computed = items.map((i) => {
    const qty = Math.round(Number(i.quantity) * 10_000) / 10_000;
    const price = Math.round(Number(i.unitPrice) * 10_000) / 10_000;
    const line = Math.round(qty * price * 100) / 100;
    const ldisc = Math.round(Number(i.discount ?? 0) * 100) / 100;
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("數量必須大於 0");
    if (!Number.isFinite(price) || price < 0) throw new Error("單價不可小於 0");
    if (!Number.isFinite(ldisc) || ldisc < 0 || ldisc > line) throw new Error("折扣金額不正確");
    const taxable = Math.round((line - ldisc) * 100) / 100;
    const rate = isTaxable ? Number(i.taxRate ?? 0.05) : 0;
    const lineTax = Math.round(taxable * rate * 100) / 100;
    subtotal += line;
    discount += ldisc;
    taxAmount += lineTax;
    return { ...i, quantity: qty, unitPrice: price, discount: ldisc, taxRate: rate, subtotal: taxable };
  });
  subtotal = Math.round(subtotal * 100) / 100;
  discount = Math.round(discount * 100) / 100;
  taxAmount = Math.round(taxAmount * 100) / 100;
  const total = Math.round((subtotal - discount + taxAmount) * 100) / 100;
  return {
    subtotal,
    discount,
    taxAmount,
    total,
    computed,
  };
}

export type FulfillmentItemInput = {
  orderItemId: string;
  quantity: number;
};

export type JournalLineInput = {
  code: string;
  debit?: number;
  credit?: number;
  memo: string;
};

const QTY_EPSILON = 0.00001;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function allocateOrderLine(item: any, quantity: number) {
  const orderedQuantity = Number(item.quantity);
  const ratio = quantity / orderedQuantity;
  const gross = roundMoney(quantity * Number(item.unitPrice));
  const discount = roundMoney(Number(item.discount) * ratio);
  const net = roundMoney(gross - discount);
  const tax = roundMoney(net * Number(item.taxRate));
  return { gross, discount, net, tax, total: roundMoney(net + tax) };
}

function selectFulfillmentItems(
  orderItems: any[],
  requestedItems: FulfillmentItemInput[] | undefined,
  fulfilledField: "receivedQty" | "shippedQty",
) {
  const itemMap = new Map(orderItems.map((item) => [item.id, item]));
  const requested = requestedItems === undefined
    ? orderItems.map((item) => ({
        orderItemId: item.id,
        quantity: roundQuantity(Number(item.quantity) - Number(item[fulfilledField])),
      })).filter((item) => item.quantity > QTY_EPSILON)
    : requestedItems;
  const seen = new Set<string>();
  const selected = requested.map((input) => {
    if (seen.has(input.orderItemId)) throw new Error("本次明細不可重複");
    seen.add(input.orderItemId);
    const item = itemMap.get(input.orderItemId);
    if (!item) throw new Error("本次明細不屬於此訂單");
    const quantity = roundQuantity(Number(input.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("本次數量必須大於 0");
    const remaining = roundQuantity(Number(item.quantity) - Number(item[fulfilledField]));
    if (quantity - remaining > QTY_EPSILON) {
      throw new Error(`商品 ${item.product?.sku ?? item.productId} 本次數量超過未交量 ${remaining}`);
    }
    return { item, quantity, allocation: allocateOrderLine(item, quantity) };
  });
  if (!selected.length) throw new Error("請至少輸入一筆本次數量");
  return selected;
}

export async function nextNumberInTransaction(tx: any, key: string, tenantId: string) {
  await tx.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: {},
    create: { tenantId, key, prefix: key, nextNo: 1 },
  });
  await tx.$executeRaw`SELECT 1 FROM "NumberSequence" WHERE "tenantId" = ${tenantId} AND "key" = ${key} FOR UPDATE`;
  const seq = await tx.numberSequence.findUnique({ where: { tenantId_key: { tenantId, key } } });
  if (!seq) throw new Error(`無法取得 ${key} 編號設定`);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(2);
  const roc = String(now.getFullYear() - 1911);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const seqStr = String(seq.nextNo).padStart(4, "0");
  const isJournal = key === "JE";
  const format = seq.format || (isJournal ? "{roc}{mm}{dd}{seq:0000}" : "{prefix}{yyyy}{mm}-{seq:0000}");
  const number = format
    .replace("{prefix}", isJournal ? "" : seq.prefix)
    .replace("{roc}", roc)
    .replace("{yyyy}", yyyy)
    .replace("{yy}", yy)
    .replace("{mm}", mm)
    .replace("{dd}", dd)
    .replace("{seq:0000}", seqStr);
  await tx.numberSequence.update({
    where: { tenantId_key: { tenantId, key } },
    data: { nextNo: seq.nextNo + 1 },
  });
  return number;
}

export async function createPostedJournal(
  tx: any,
  tenantId: string,
  summary: string,
  createdById: string | undefined,
  lines: JournalLineInput[],
  entryDate: Date = new Date(),
) {
  await lockAndAssertAccountingPeriodOpen(tx, tenantId, entryDate);
  const nonZeroLines = lines.filter((line) => roundMoney(line.debit ?? 0) !== 0 || roundMoney(line.credit ?? 0) !== 0);
  if (!nonZeroLines.length) throw new Error("傳票金額不可為 0");
  const codes = [...new Set(nonZeroLines.map((line) => line.code))];
  const accounts = await tx.chartOfAccount.findMany({
    where: { tenantId, code: { in: codes }, isActive: true },
    select: { id: true, code: true },
  });
  const accountMap = new Map(accounts.map((account: any) => [account.code, account.id]));
  const missing = codes.filter((code) => !accountMap.has(code));
  if (missing.length) throw new Error(`缺少標準會計科目：${missing.join("、")}，請由管理者執行科目初始化`);

  const debit = roundMoney(nonZeroLines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));
  const credit = roundMoney(nonZeroLines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));
  if (Math.abs(debit - credit) > 0.001) throw new Error(`傳票借貸不平衡：借 ${debit}／貸 ${credit}`);

  const number = await nextNumberInTransaction(tx, "JE", tenantId);
  return tx.journalEntry.create({
    data: {
      tenantId,
      number,
      entryDate,
      summary,
      status: "POSTED",
      createdById,
      postedById: createdById,
      postedAt: new Date(),
      lines: {
        create: nonZeroLines.map((line) => ({
          accountId: accountMap.get(line.code),
          debit: roundMoney(line.debit ?? 0),
          credit: roundMoney(line.credit ?? 0),
          memo: line.memo,
        })),
      },
    },
  });
}

function sumAllocations(selected: ReturnType<typeof selectFulfillmentItems>) {
  return selected.reduce(
    (sum, selectedItem) => ({
      subtotal: roundMoney(sum.subtotal + selectedItem.allocation.gross),
      discount: roundMoney(sum.discount + selectedItem.allocation.discount),
      taxAmount: roundMoney(sum.taxAmount + selectedItem.allocation.tax),
      total: roundMoney(sum.total + selectedItem.allocation.total),
    }),
    { subtotal: 0, discount: 0, taxAmount: 0, total: 0 },
  );
}

function isFulfillmentComplete(orderItems: any[], selected: ReturnType<typeof selectFulfillmentItems>, fulfilledField: "receivedQty" | "shippedQty") {
  const selectedMap = new Map(selected.map(({ item, quantity }) => [item.id, quantity]));
  return orderItems.every((item) => {
    const fulfilled = Number(item[fulfilledField]) + Number(selectedMap.get(item.id) ?? 0);
    return Number(item.quantity) - fulfilled <= QTY_EPSILON;
  });
}

// 採購驗收：允許分批進貨；驗收單、庫存、應付與傳票必須同時成功或同時回復。
export async function receivePurchaseOrder(
  orderId: string,
  warehouseId: string,
  tenantId: string,
  requestedItems?: FulfillmentItemInput[],
  createdById?: string,
  remark?: string,
) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase:${tenantId}:${orderId}`}))`;
    const order = await tx.purchaseOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new Error("找不到採購單");
    if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(order.status)) {
      throw new Error("只有已核准或部分進貨的採購單可以驗收入庫");
    }
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, tenantId, isActive: true } });
    if (!warehouse) throw new Error("找不到可用的入庫倉庫");

    const selected = selectFulfillmentItems(order.items, requestedItems, "receivedQty");
    const complete = isFulfillmentComplete(order.items, selected, "receivedQty");
    let totals = sumAllocations(selected);
    if (complete) {
      const prior = await tx.purchaseReceipt.aggregate({
        where: { tenantId, orderId, status: "POSTED" },
        _sum: { subtotal: true, discount: true, taxAmount: true, total: true },
      });
      totals = {
        subtotal: roundMoney(Number(order.subtotal) - Number(prior._sum.subtotal ?? 0)),
        discount: roundMoney(Number(order.discount) - Number(prior._sum.discount ?? 0)),
        taxAmount: roundMoney(Number(order.taxAmount) - Number(prior._sum.taxAmount ?? 0)),
        total: roundMoney(Number(order.total) - Number(prior._sum.total ?? 0)),
      };
    }

    const receiptNumber = await nextNumberInTransaction(tx, "GR", tenantId);
    const receipt = await tx.purchaseReceipt.create({
      data: {
        tenantId,
        orderId,
        warehouseId,
        number: receiptNumber,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        remark,
        createdById,
        items: {
          create: selected.map(({ item, quantity, allocation }) => ({
            orderItemId: item.id,
            productId: item.productId,
            quantity,
            unitPrice: item.unitPrice,
            discount: allocation.discount,
            taxRate: item.taxRate,
            subtotal: allocation.net,
          })),
        },
      },
    });

    for (const { item, quantity } of selected) {
      await tx.inventoryStock.upsert({
        where: { productId_warehouseId: { productId: item.productId, warehouseId } },
        update: { quantity: { increment: quantity } },
        create: { tenantId, productId: item.productId, warehouseId, quantity },
      });
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          productId: item.productId,
          warehouseId,
          type: "PURCHASE_IN",
          quantity,
          unitCost: item.unitPrice,
          refType: "PURCHASE_RECEIPT",
          refId: receipt.id,
          remark: `採購驗收 ${receipt.number}（原單 ${order.number}）`,
        },
      });
      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: { receivedQty: { increment: quantity } },
      });
    }

    await tx.accountsPayable.create({
      data: {
        tenantId,
        supplierId: order.supplierId,
        purchaseOrderId: order.id,
        purchaseReceiptId: receipt.id,
        amount: totals.total,
        status: "POSTED",
      },
    });
    await createPostedJournal(tx, tenantId, `採購驗收 ${receipt.number}（原單 ${order.number}）`, createdById, [
      { code: "1201", debit: roundMoney(totals.subtotal - totals.discount), memo: `存貨－${receipt.number}` },
      { code: "1151", debit: totals.taxAmount, memo: `進項稅額－${receipt.number}` },
      { code: "2103", credit: totals.total, memo: `應付帳款－${receipt.number}` },
    ]);
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: complete ? "POSTED" : "PARTIALLY_RECEIVED",
        receivedAt: complete ? new Date() : null,
        warehouseId,
        updatedBy: createdById,
      },
    });

    return { receipt, complete, totals };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}

// 銷售出貨：允許分批出貨；出貨單、庫存、應收、銷貨與成本傳票保持原子性。
export async function shipSalesOrder(
  orderId: string,
  warehouseId: string,
  tenantId: string,
  requestedItems?: FulfillmentItemInput[],
  createdById?: string,
  remark?: string,
) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales:${tenantId}:${orderId}`}))`;
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new Error("找不到銷售單");
    if (!["APPROVED", "PARTIALLY_SHIPPED"].includes(order.status)) {
      throw new Error("只有已核准或部分出貨的銷售單可以出貨");
    }
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, tenantId, isActive: true } });
    if (!warehouse) throw new Error("找不到可用的出貨倉庫");

    const selected = selectFulfillmentItems(order.items, requestedItems, "shippedQty");
    const complete = isFulfillmentComplete(order.items, selected, "shippedQty");
    let totals = sumAllocations(selected);
    if (complete) {
      const prior = await tx.salesShipment.aggregate({
        where: { tenantId, orderId, status: "POSTED" },
        _sum: { subtotal: true, discount: true, taxAmount: true, total: true },
      });
      totals = {
        subtotal: roundMoney(Number(order.subtotal) - Number(prior._sum.subtotal ?? 0)),
        discount: roundMoney(Number(order.discount) - Number(prior._sum.discount ?? 0)),
        taxAmount: roundMoney(Number(order.taxAmount) - Number(prior._sum.taxAmount ?? 0)),
        total: roundMoney(Number(order.total) - Number(prior._sum.total ?? 0)),
      };
    }
    const cogs = roundMoney(selected.reduce(
      (sum, selectedItem) => sum + selectedItem.quantity * Number(selectedItem.item.product?.costPrice ?? 0),
      0,
    ));

    const shipmentNumber = await nextNumberInTransaction(tx, "DN", tenantId);
    const shipment = await tx.salesShipment.create({
      data: {
        tenantId,
        orderId,
        warehouseId,
        number: shipmentNumber,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        cogs,
        remark,
        createdById,
        items: {
          create: selected.map(({ item, quantity, allocation }) => ({
            orderItemId: item.id,
            productId: item.productId,
            quantity,
            unitPrice: item.unitPrice,
            discount: allocation.discount,
            taxRate: item.taxRate,
            subtotal: allocation.net,
            unitCost: item.product?.costPrice ?? 0,
          })),
        },
      },
    });

    for (const { item, quantity } of selected) {
      const changed = await tx.inventoryStock.updateMany({
        where: { tenantId, productId: item.productId, warehouseId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (changed.count !== 1) throw new Error(`商品 ${item.product?.sku ?? ""} 庫存不足`);
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          productId: item.productId,
          warehouseId,
          type: "SALES_OUT",
          quantity: quantity * -1,
          unitCost: item.product?.costPrice ?? 0,
          refType: "SALES_SHIPMENT",
          refId: shipment.id,
          remark: `銷售出貨 ${shipment.number}（原單 ${order.number}）`,
        },
      });
      await tx.salesOrderItem.update({
        where: { id: item.id },
        data: { shippedQty: { increment: quantity } },
      });
    }

    await tx.accountsReceivable.create({
      data: {
        tenantId,
        customerId: order.customerId,
        salesOrderId: order.id,
        salesShipmentId: shipment.id,
        amount: totals.total,
        status: "POSTED",
      },
    });
    await createPostedJournal(tx, tenantId, `銷售出貨 ${shipment.number}（原單 ${order.number}）`, createdById, [
      { code: "1132", debit: totals.total, memo: `應收帳款－${shipment.number}` },
      { code: "4101", credit: roundMoney(totals.subtotal - totals.discount), memo: `銷貨收入－${shipment.number}` },
      { code: "2111", credit: totals.taxAmount, memo: `銷項稅額－${shipment.number}` },
      { code: "5101", debit: cogs, memo: `銷貨成本－${shipment.number}` },
      { code: "1201", credit: cogs, memo: `存貨－${shipment.number}` },
    ]);
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: complete ? "POSTED" : "PARTIALLY_SHIPPED",
        shippedAt: complete ? new Date() : null,
        warehouseId,
        updatedBy: createdById,
      },
    });

    return { shipment, complete, totals, cogs };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}
