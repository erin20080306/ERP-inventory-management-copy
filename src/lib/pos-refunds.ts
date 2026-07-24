import { ApiError } from "./api";
import { createPostedJournal, nextNumberInTransaction } from "./documents";
import { prisma } from "./prisma";

export type PosRefundItemInput = {
  saleItemId: string;
  quantity: number;
  disposition?: "SELLABLE" | "DAMAGED" | "SCRAP";
};

const QTY_EPSILON = 0.00001;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function allocateRefundPayments(
  originalPayments: Array<{ method: string; amount: unknown }>,
  priorRefundPayments: Array<{ method: string; amount: unknown }>,
  refundTotal: number,
) {
  const original = new Map<string, number>();
  for (const payment of originalPayments) {
    original.set(payment.method, roundMoney((original.get(payment.method) ?? 0) + Number(payment.amount)));
  }
  const refunded = new Map<string, number>();
  for (const payment of priorRefundPayments) {
    refunded.set(payment.method, roundMoney((refunded.get(payment.method) ?? 0) + Number(payment.amount)));
  }
  const capacities = [...original.entries()]
    .map(([method, amount]) => ({ method, cents: Math.max(0, Math.round((amount - (refunded.get(method) ?? 0)) * 100)) }))
    .filter((payment) => payment.cents > 0);
  const capacityCents = capacities.reduce((sum, payment) => sum + payment.cents, 0);
  const refundCents = Math.round(refundTotal * 100);
  if (refundCents > capacityCents) throw new ApiError(409, "退款金額超過原交易尚可退款金額");

  const allocated = capacities.map((payment) => ({
    ...payment,
    allocated: Math.min(payment.cents, Math.floor(refundCents * payment.cents / capacityCents)),
  }));
  let remainder = refundCents - allocated.reduce((sum, payment) => sum + payment.allocated, 0);
  while (remainder > 0) {
    let changed = false;
    for (const payment of allocated) {
      if (remainder <= 0) break;
      if (payment.allocated >= payment.cents) continue;
      payment.allocated += 1;
      remainder -= 1;
      changed = true;
    }
    if (!changed) throw new ApiError(409, "無法依原付款方式分配退款");
  }
  return allocated
    .filter((payment) => payment.allocated > 0)
    .map((payment) => ({ method: payment.method, amount: payment.allocated / 100 }));
}

export async function refundPosSale(options: {
  tenantId: string;
  userId: string;
  shiftId: string;
  saleId: string;
  items: PosRefundItemInput[];
  reason: string;
  returnWarehouseId?: string;
}) {
  const { tenantId, userId, shiftId, saleId, reason } = options;
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-shift:${tenantId}:${shiftId}`}))`;
    const shift = await tx.posShift.findFirst({
      where: { id: shiftId, tenantId, userId, status: "OPEN" },
      include: { register: true },
    });
    if (!shift) throw new ApiError(409, "請先開班，或目前班次已結束");

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-sale:${tenantId}:${saleId}`}))`;
    const sale = await tx.posSale.findFirst({
      where: { id: saleId, tenantId },
      include: {
        register: true,
        items: {
          include: {
            product: { include: { medicalPackage: true } },
            refundItems: {
              where: { refund: { status: "COMPLETED" } },
              select: { quantity: true, subtotal: true, discount: true },
            },
          },
        },
        payments: true,
        refunds: {
          where: { status: "COMPLETED" },
          include: { payments: true },
        },
        medicalReceipt: true,
        medicalPackagePurchase: true,
      },
    });
    if (!sale) throw new ApiError(404, "找不到原 POS 交易");
    if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(sale.status)) {
      throw new ApiError(409, sale.status === "REFUNDED" ? "此交易已全數退款" : "此交易不可退款");
    }
    if (sale.medicalPackagePurchase && sale.medicalPackagePurchase.remainingSessions < sale.medicalPackagePurchase.totalSessions) {
      throw new ApiError(409, "療程套票已有核銷紀錄，請由有權限人員先處理療程更正，不可直接退款");
    }
    const returnWarehouseId = options.returnWarehouseId || sale.register.warehouseId;
    const returnWarehouse = await tx.warehouse.findFirst({
      where: { id: returnWarehouseId, tenantId, isActive: true },
      select: { id: true, name: true },
    });
    if (!returnWarehouse) throw new ApiError(400, "指定的退貨門市／倉庫不存在或已停用");

    const itemMap = new Map(sale.items.map((item: any) => [item.id, item]));
    const seen = new Set<string>();
    const selected = options.items.map((input) => {
      if (seen.has(input.saleItemId)) throw new ApiError(400, "退款品項不可重複");
      seen.add(input.saleItemId);
      const item: any = itemMap.get(input.saleItemId);
      if (!item) throw new ApiError(400, "退款品項不屬於原交易");
      const quantity = roundQuantity(Number(input.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, "退款數量必須大於 0");
      const remaining = roundQuantity(Number(item.quantity) - Number(item.returnedQty));
      if (quantity - remaining > QTY_EPSILON) {
        throw new ApiError(409, `${item.product.name} 退款數量超過尚可退數量 ${remaining}`);
      }
      const priorGross = roundMoney(item.refundItems.reduce((sum: number, refundItem: any) => sum + Number(refundItem.subtotal), 0));
      const priorDiscount = roundMoney(item.refundItems.reduce((sum: number, refundItem: any) => sum + Number(refundItem.discount), 0));
      const lineComplete = remaining - quantity <= QTY_EPSILON;
      const ratio = quantity / Number(item.quantity);
      const gross = lineComplete
        ? roundMoney(Number(item.subtotal) - priorGross)
        : roundMoney(Number(item.subtotal) * ratio);
      const discount = lineComplete
        ? roundMoney(Number(item.discount) - priorDiscount)
        : roundMoney(Number(item.discount) * ratio);
      const taxRate = Number(item.taxRate);
      const net = roundMoney(gross / (1 + taxRate));
      const tax = roundMoney(gross - net);
      const unitCost = Number(item.unitCost);
      const disposition = input.disposition ?? "SELLABLE";
      if (!(["SELLABLE", "DAMAGED", "SCRAP"] as string[]).includes(disposition)) throw new ApiError(400, "退貨品況設定無效");
      return { item, quantity, gross, discount, taxRate, net, tax, unitCost, disposition, cogs: roundMoney(quantity * unitCost) };
    });
    if (!selected.length) throw new ApiError(400, "請至少選擇一筆退款品項");

    const totals = selected.reduce((sum, item) => ({
      subtotal: roundMoney(sum.subtotal + item.net),
      discount: roundMoney(sum.discount + item.discount),
      taxAmount: roundMoney(sum.taxAmount + item.tax),
      total: roundMoney(sum.total + item.gross),
      cogs: roundMoney(sum.cogs + (item.disposition === "SELLABLE" ? item.cogs : 0)),
      writeOffCost: roundMoney(sum.writeOffCost + (item.disposition === "SELLABLE" ? 0 : item.cogs)),
    }), { subtotal: 0, discount: 0, taxAmount: 0, total: 0, cogs: 0, writeOffCost: 0 });
    const priorRefundPayments = sale.refunds.flatMap((refund: any) => refund.payments);
    const refundPayments = allocateRefundPayments(sale.payments, priorRefundPayments, totals.total);
    const deferredRefund = roundMoney(selected
      .filter((item) => item.item.product.medicalPackage)
      .reduce((sum, item) => sum + item.net, 0));
    const recognizedRefund = roundMoney(totals.subtotal - deferredRefund);
    const selectedMap = new Map(selected.map((item) => [item.item.id, item.quantity]));
    const fullyRefunded = sale.items.every((item: any) => (
      Number(item.returnedQty) + Number(selectedMap.get(item.id) ?? 0) >= Number(item.quantity) - QTY_EPSILON
    ));
    const priorRefundTotal = roundMoney(sale.refunds.reduce((sum: number, prior: any) => sum + Number(prior.total), 0));
    const cumulativeRatio = Math.min(1, (priorRefundTotal + totals.total) / Math.max(0.01, Number(sale.total)));
    const priorPointsReversed = sale.refunds.reduce((sum: number, prior: any) => sum + Number(prior.loyaltyPointsReversed ?? 0), 0);
    const priorPointsRestored = sale.refunds.reduce((sum: number, prior: any) => sum + Number(prior.loyaltyPointsRestored ?? 0), 0);
    const targetPointsReversed = fullyRefunded ? Number(sale.loyaltyPointsEarned ?? 0) : Math.floor(Number(sale.loyaltyPointsEarned ?? 0) * cumulativeRatio);
    const targetPointsRestored = fullyRefunded ? Number(sale.loyaltyPointsRedeemed ?? 0) : Math.floor(Number(sale.loyaltyPointsRedeemed ?? 0) * cumulativeRatio);
    const loyaltyPointsReversed = Math.max(0, targetPointsReversed - priorPointsReversed);
    const loyaltyPointsRestored = Math.max(0, targetPointsRestored - priorPointsRestored);

    const refundNumber = await nextNumberInTransaction(tx, "PRF", tenantId);
    const refund = await tx.posRefund.create({
      data: {
        tenantId,
        saleId: sale.id,
        shiftId: shift.id,
        registerId: shift.registerId,
        warehouseId: returnWarehouse.id,
        number: refundNumber,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        cogs: totals.cogs,
        writeOffCost: totals.writeOffCost,
        loyaltyPointsReversed,
        loyaltyPointsRestored,
        reason,
        createdById: userId,
        items: {
          create: selected.map((selectedItem) => ({
            saleItemId: selectedItem.item.id,
            productId: selectedItem.item.productId,
            quantity: selectedItem.quantity,
            unitPrice: selectedItem.item.unitPrice,
            unitCost: selectedItem.unitCost,
            discount: selectedItem.discount,
            taxRate: selectedItem.taxRate,
            subtotal: selectedItem.gross,
            disposition: selectedItem.disposition,
          })),
        },
        payments: { create: refundPayments },
      },
      include: { items: { include: { product: true } }, payments: true },
    });

    for (const selectedItem of selected) {
      if (selectedItem.item.product.trackInventory && selectedItem.disposition === "SELLABLE") {
        await tx.inventoryStock.upsert({
          where: {
            productId_warehouseId: {
              productId: selectedItem.item.productId,
              warehouseId: returnWarehouse.id,
            },
          },
          update: { quantity: { increment: selectedItem.quantity } },
          create: {
            tenantId,
            productId: selectedItem.item.productId,
            warehouseId: returnWarehouse.id,
            quantity: selectedItem.quantity,
          },
        });
        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            productId: selectedItem.item.productId,
            warehouseId: returnWarehouse.id,
            type: "SALES_RETURN_IN",
            quantity: selectedItem.quantity,
            unitCost: selectedItem.unitCost,
            refType: "POS_REFUND",
            refId: refund.id,
            remark: `POS 退款 ${refund.number}（原交易 ${sale.number}；入庫 ${returnWarehouse.name}）`,
          },
        });
      }
      await tx.posSaleItem.update({
        where: { id: selectedItem.item.id },
        data: { returnedQty: { increment: selectedItem.quantity } },
      });
    }

    await tx.posSale.update({
      where: { id: sale.id },
      data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });
    if (sale.medicalReceipt) {
      await tx.medicalReceipt.update({
        where: { id: sale.medicalReceipt.id },
        data: {
          status: fullyRefunded ? "VOIDED" : "PARTIALLY_REFUNDED",
          voidReason: reason,
          voidedAt: fullyRefunded ? new Date() : null,
        },
      });
    }
    if (fullyRefunded && sale.medicalPackagePurchase) {
      await tx.medicalPackagePurchase.update({ where: { id: sale.medicalPackagePurchase.id }, data: { status: "CANCELLED" } });
    }
    const loyaltyNet = loyaltyPointsRestored - loyaltyPointsReversed;
    if (sale.customerId && loyaltyNet !== 0) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-loyalty:${tenantId}:${sale.customerId}`}))`;
      const customer = await tx.customer.update({
        where: { id: sale.customerId },
        data: { loyaltyPoints: { increment: loyaltyNet } },
        select: { loyaltyPoints: true },
      });
      await tx.customerLoyaltyTransaction.upsert({
        where: { saleId_type: { saleId: sale.id, type: "REFUND" } },
        update: { points: { increment: loyaltyNet }, balanceAfter: customer.loyaltyPoints },
        create: { tenantId, customerId: sale.customerId, saleId: sale.id, type: "REFUND", points: loyaltyNet, balanceAfter: customer.loyaltyPoints },
      });
    }
    const paymentJournalLines = refundPayments.map((payment) => ({
      code: payment.method === "WALLET" ? "2121" : payment.method === "CASH" ? "1101" : "1103",
      credit: payment.amount,
      memo: `${payment.method} 退款－${refund.number}`,
    }));
    const walletRefund = refundPayments.find((payment) => payment.method === "WALLET");
    if (walletRefund && sale.customerId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`medical-wallet:${tenantId}:${sale.customerId}`}))`;
      const wallet = await tx.medicalWallet.findFirst({ where: { tenantId, customerId: sale.customerId } });
      if (!wallet) throw new ApiError(409, "找不到原會員儲值帳戶");
      const balanceAfter = roundMoney(Number(wallet.balance) + walletRefund.amount);
      await tx.medicalWallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
      await tx.medicalWalletTransaction.create({
        data: {
          tenantId,
          walletId: wallet.id,
          number: await nextNumberInTransaction(tx, "MW", tenantId),
          type: "REFUND",
          amount: walletRefund.amount,
          balanceAfter,
          paymentMethod: "WALLET",
          reference: refund.number,
          note: reason,
          createdById: userId,
        },
      });
    }
    await createPostedJournal(tx, tenantId, `POS 退款 ${refund.number}（原交易 ${sale.number}）`, userId, [
      { code: "4102", debit: recognizedRefund, memo: `銷貨／醫美服務退回－${refund.number}` },
      { code: "2121", debit: deferredRefund, memo: `療程套票預收款退回－${refund.number}` },
      { code: "2111", debit: totals.taxAmount, memo: `銷項稅額轉回－${refund.number}` },
      ...paymentJournalLines,
      ...(totals.cogs > 0 ? [
        { code: "1201", debit: totals.cogs, memo: `可售品退貨入庫－${refund.number}` },
        { code: "5101", credit: totals.cogs, memo: `可售品銷貨成本轉回－${refund.number}` },
      ] : []),
    ]);

    return { refund, fullyRefunded, totals, originalSaleNumber: sale.number, returnWarehouse };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}
