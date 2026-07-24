import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { attachPosShiftOperators, getLedgerCashBalance, getPosDailySummary, getPosShiftCashPosition } from "@/lib/pos-daily-summary";

export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  const openShiftPromise = prisma.posShift.findFirst({
    where: { tenantId, userId: session.user.id, status: "OPEN" },
    include: { register: { select: { id: true, code: true, name: true, warehouseId: true } } },
    orderBy: { openedAt: "desc" },
  });
  const openShiftWithOperatorsPromise = openShiftPromise.then((shift) => attachPosShiftOperators(shift));
  const [registers, warehouses, openShift, today, shiftCash, ledgerCashBalance, recentSales] = await Promise.all([
    prisma.posRegister.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, warehouse: { select: { id: true, code: true, name: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    openShiftWithOperatorsPromise,
    getPosDailySummary(tenantId),
    openShiftPromise.then((shift) => getPosShiftCashPosition(shift)),
    getLedgerCashBalance(tenantId),
    prisma.posSale.findMany({
      where: { tenantId },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        total: true,
        status: true,
        createdAt: true,
        register: { select: { name: true } },
        customer: { select: { companyName: true } },
        refunds: { where: { status: "COMPLETED" }, select: { total: true } },
      },
    }),
  ]);


  return NextResponse.json({
    registers,
    warehouses,
    openShift,
    today,
    shiftCash,
    ledgerCashBalance,
    recentSales: recentSales.map((sale) => ({
      ...sale,
      refundedTotal: sale.refunds.reduce((sum, refund) => sum + Number(refund.total), 0),
    })),
    serverTime: new Date().toISOString(),
  });
});
