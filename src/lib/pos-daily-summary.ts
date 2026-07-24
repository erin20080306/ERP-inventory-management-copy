import { prisma } from "@/lib/prisma";

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function taipeiDayRange(now = new Date()) {
  const shifted = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  const start = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - TAIPEI_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export async function getPosDailySummary(tenantId: string, client: any = prisma) {
  const { start, end } = taipeiDayRange();
  const [sales, refunds, saleItems, refundItems] = await Promise.all([
    client.posSale.aggregate({
      where: { tenantId, status: { not: "VOIDED" }, createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    client.posRefund.aggregate({
      where: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    client.posSaleItem.aggregate({
      where: { sale: { tenantId, status: { not: "VOIDED" }, createdAt: { gte: start, lt: end } } },
      _sum: { quantity: true },
    }),
    client.posRefundItem.aggregate({
      where: { refund: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } } },
      _sum: { quantity: true },
    }),
  ]);
  const grossAmount = Number(sales._sum.total ?? 0);
  const refundAmount = Number(refunds._sum.total ?? 0);
  const soldQuantity = Number(saleItems._sum.quantity ?? 0);
  const refundedQuantity = Number(refundItems._sum.quantity ?? 0);
  return {
    sales: sales._count._all,
    refunds: refunds._count._all,
    grossAmount,
    refundAmount,
    amount: grossAmount - refundAmount,
    soldQuantity,
    refundedQuantity,
    netQuantity: soldQuantity - refundedQuantity,
  };
}

export async function getLedgerCashBalance(tenantId: string, client: any = prisma) {
  const accounts = await client.chartOfAccount.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { name: "庫存現金" },
        { code: "1101" },
      ],
    },
    select: { id: true, code: true, name: true, openingBalance: true },
  });
  const account = accounts.find((item: any) => item.name === "庫存現金")
    ?? accounts.find((item: any) => item.code === "1101");
  if (!account) return 0;
  const totals = await client.journalEntryLine.aggregate({
    where: {
      accountId: account.id,
      entry: { tenantId, status: "POSTED" },
    },
    _sum: { debit: true, credit: true },
  });
  return Math.round((
    Number(account.openingBalance ?? 0)
    + Number(totals._sum.debit ?? 0)
    - Number(totals._sum.credit ?? 0)
  ) * 100) / 100;
}

export async function attachPosShiftOperators<T extends { userId: string; closedById?: string | null }>(
  shift: T | null,
  client: any = prisma,
) {
  if (!shift) return null;
  const operatorIds = [...new Set([shift.userId, shift.closedById].filter(Boolean))] as string[];
  const operators = await client.user.findMany({
    where: { id: { in: operatorIds } },
    select: { id: true, name: true, username: true },
  });
  const byId = new Map<string, { id: string; name: string; username: string }>(operators.map((operator: any) => [operator.id, operator]));
  return {
    ...shift,
    openedBy: byId.get(shift.userId) ?? { id: shift.userId, name: "未知人員", username: "" },
    closedBy: shift.closedById ? byId.get(shift.closedById) ?? { id: shift.closedById, name: "未知人員", username: "" } : null,
  };
}

export async function getPosShiftCashPosition(
  shift: { id: string; openingCash: unknown } | null,
  client: any = prisma,
) {
  if (!shift) return null;
  const [cashSales, cashRefunds, movements] = await Promise.all([
    client.posPayment.aggregate({
      where: { method: "CASH", sale: { shiftId: shift.id, status: { not: "VOIDED" } } },
      _sum: { amount: true },
    }),
    client.posRefundPayment.aggregate({
      where: { method: "CASH", refund: { shiftId: shift.id, status: "COMPLETED" } },
      _sum: { amount: true },
    }),
    client.posCashMovement.groupBy({
      by: ["type"],
      where: { shiftId: shift.id, status: "APPROVED" },
      _sum: { amount: true },
    }),
  ]);
  const movementTotals = { paidIn: 0, paidOut: 0, safeDrop: 0 };
  for (const movement of movements) {
    const amount = Number(movement._sum.amount ?? 0);
    if (movement.type === "PAID_IN") movementTotals.paidIn += amount;
    if (movement.type === "PAID_OUT") movementTotals.paidOut += amount;
    if (movement.type === "SAFE_DROP") movementTotals.safeDrop += amount;
  }
  const openingCash = Number(shift.openingCash);
  const cashSalesAmount = Number(cashSales._sum.amount ?? 0);
  const cashRefundAmount = Number(cashRefunds._sum.amount ?? 0);
  const expectedCash = Math.round((
    openingCash
    + cashSalesAmount
    - cashRefundAmount
    + movementTotals.paidIn
    - movementTotals.paidOut
    - movementTotals.safeDrop
  ) * 100) / 100;
  return {
    openingCash,
    cashSales: cashSalesAmount,
    cashRefunds: cashRefundAmount,
    expectedCash,
    cashMovements: movementTotals,
  };
}
