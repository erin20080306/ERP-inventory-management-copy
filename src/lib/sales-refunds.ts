import { ApiError } from "./api";
import { createPostedJournal, nextNumberInTransaction } from "./documents";
import { prisma } from "./prisma";

export type SalesRefundDisposition = "SELLABLE" | "DAMAGED" | "SCRAP";

type RefundSalesOrderInput = {
  tenantId: string;
  userId: string;
  salesOrderId: string;
  reason: string;
  refundReference: string;
  items: Array<{ orderItemId: string; quantity: number; disposition?: SalesRefundDisposition }>;
};

const QTY_EPSILON = 0.00001;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export async function refundStorefrontSalesOrder(input: RefundSalesOrderInput) {
  const reason = input.reason.trim();
  const refundReference = input.refundReference.trim();
  if (reason.length < 2) throw new ApiError(400, "請輸入至少 2 個字的退款原因");
  if (refundReference.length < 2) throw new ApiError(400, "請輸入金流退款序號或人工退款憑證");
  if (!input.items.length) throw new ApiError(400, "請至少選擇一筆退款商品");

  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-refund:${input.tenantId}:${input.salesOrderId}`}))`;
    const order = await tx.salesOrder.findFirst({
      where: {
        id: input.salesOrderId,
        tenantId: input.tenantId,
        status: { in: ["PARTIALLY_SHIPPED", "POSTED"] },
      },
      include: {
        storefrontPayment: true,
        items: { include: { product: { select: { name: true, sku: true, costPrice: true } } } },
      },
    });
    if (!order) throw new ApiError(404, "找不到已出貨、可退款的電商交易");
    const payment = order.storefrontPayment;
    if (!payment) throw new ApiError(409, "此單不是電商付款交易，請改由銷貨退回模組處理");
    if (!["PAID", "PARTIALLY_REFUNDED"].includes(payment.status)) {
      throw new ApiError(409, "此電商訂單尚未確認收款；未收款訂單應作廢，不應建立退款");
    }

    const itemMap = new Map(order.items.map((item: any) => [item.id, item]));
    const seen = new Set<string>();
    const selected = input.items.map((requested) => {
      if (seen.has(requested.orderItemId)) throw new ApiError(400, "退款品項不可重複");
      seen.add(requested.orderItemId);
      const item: any = itemMap.get(requested.orderItemId);
      if (!item) throw new ApiError(400, "退款品項不屬於原交易");
      const quantity = roundQuantity(Number(requested.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, "退款數量必須大於 0");
      const remaining = roundQuantity(Number(item.shippedQty) - Number(item.returnedQty));
      if (quantity - remaining > QTY_EPSILON) throw new ApiError(409, `${item.product.name} 最多可退 ${remaining}`);
      const disposition = requested.disposition ?? "SELLABLE";
      if (!(["SELLABLE", "DAMAGED", "SCRAP"] as string[]).includes(disposition)) throw new ApiError(400, "退貨品況無效");
      const ratio = quantity / Number(item.quantity);
      const gross = roundMoney(quantity * Number(item.unitPrice));
      const discount = roundMoney(Number(item.discount) * ratio);
      const net = roundMoney(gross - discount);
      const tax = roundMoney(net * Number(item.taxRate));
      const total = roundMoney(net + tax);
      const cogs = roundMoney(quantity * Number(item.product.costPrice));
      return { item, quantity, disposition, discount, net, tax, total, cogs };
    });

    const selectedMap = new Map(selected.map((entry) => [entry.item.id, entry.quantity]));
    const fullReturn = order.status === "POSTED" && order.items.every((item: any) => (
      Number(item.returnedQty) + Number(selectedMap.get(item.id) ?? 0) >= Number(item.shippedQty) - QTY_EPSILON
    ));
    const paymentRemaining = roundMoney(Number(payment.amount) - Number(payment.refundedAmount));
    const lineTotals = selected.reduce((sum, entry) => ({
      subtotal: roundMoney(sum.subtotal + entry.net),
      taxAmount: roundMoney(sum.taxAmount + entry.tax),
      total: roundMoney(sum.total + entry.total),
      cogs: roundMoney(sum.cogs + (entry.disposition === "SELLABLE" ? entry.cogs : 0)),
    }), { subtotal: 0, taxAmount: 0, total: 0, cogs: 0 });
    const fullOrderAdjustment = fullReturn ? roundMoney(Math.max(0, paymentRemaining - lineTotals.total)) : 0;
    const totals = {
      subtotal: roundMoney(lineTotals.subtotal + fullOrderAdjustment),
      taxAmount: lineTotals.taxAmount,
      total: roundMoney(lineTotals.total + fullOrderAdjustment),
      cogs: lineTotals.cogs,
    };
    if (totals.total - paymentRemaining > 0.001) throw new ApiError(409, `本次退款 ${totals.total} 超過付款尚可退金額 ${paymentRemaining}`);

    const number = await nextNumberInTransaction(tx, "SR", input.tenantId);
    const salesReturn = await tx.salesReturn.create({
      data: {
        tenantId: input.tenantId,
        number,
        customerId: order.customerId,
        salesOrderId: order.id,
        reason,
        status: "POSTED",
        total: totals.total,
        isTaxable: order.isTaxable,
        updatedBy: input.userId,
        refundMethod: payment.method,
        refundReference,
        refundedAt: new Date(),
        items: {
          create: selected.map((entry) => ({
            salesOrderItemId: entry.item.id,
            productId: entry.item.productId,
            quantity: entry.quantity,
            unitPrice: entry.item.unitPrice,
            discount: entry.discount,
            taxRate: entry.item.taxRate,
            subtotal: entry.net,
            disposition: entry.disposition,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    for (const entry of selected) {
      if (entry.disposition === "SELLABLE") {
        if (!order.warehouseId) throw new ApiError(409, "原訂單缺少出貨倉庫，無法退回庫存");
        await tx.inventoryStock.upsert({
          where: { productId_warehouseId: { productId: entry.item.productId, warehouseId: order.warehouseId } },
          update: { quantity: { increment: entry.quantity } },
          create: { tenantId: input.tenantId, productId: entry.item.productId, warehouseId: order.warehouseId, quantity: entry.quantity },
        });
        await tx.inventoryTransaction.create({
          data: {
            tenantId: input.tenantId,
            productId: entry.item.productId,
            warehouseId: order.warehouseId,
            type: "SALES_RETURN_IN",
            quantity: entry.quantity,
            unitCost: entry.item.product.costPrice,
            refType: "SALES_RETURN",
            refId: salesReturn.id,
            remark: `電商退款 ${number}（原單 ${order.number}）`,
          },
        });
      }
      await tx.salesOrderItem.update({
        where: { id: entry.item.id },
        data: { returnedQty: { increment: entry.quantity } },
      });
    }

    await tx.accountsReceivable.create({
      data: {
        tenantId: input.tenantId,
        customerId: order.customerId,
        salesOrderId: order.id,
        amount: totals.total * -1,
        paidAmount: totals.total * -1,
        status: "PAID",
        updatedBy: input.userId,
      },
    });
    const cumulativeRefund = roundMoney(Number(payment.refundedAmount) + totals.total);
    const fullyRefunded = cumulativeRefund >= Number(payment.amount) - 0.001;
    await tx.storefrontPayment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: cumulativeRefund,
        status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
    });

    await createPostedJournal(tx, input.tenantId, `電商退款 ${number}（原單 ${order.number}）`, input.userId, [
      { code: "4102", debit: totals.subtotal, memo: `銷貨退回與退款－${number}` },
      { code: "2111", debit: totals.taxAmount, memo: `銷項稅額轉回－${number}` },
      { code: "1103", credit: totals.total, memo: `${payment.method} 退款－${refundReference}` },
      ...(totals.cogs > 0 ? [
        { code: "1201", debit: totals.cogs, memo: `良品退回庫存－${number}` },
        { code: "5101", credit: totals.cogs, memo: `銷貨成本轉回－${number}` },
      ] : []),
    ]);

    return { salesReturn, originalOrderNumber: order.number, fullReturn, fullyRefunded, totals };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}