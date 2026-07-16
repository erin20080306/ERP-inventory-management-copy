import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

function taipeiDayRange(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * 60 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  const { start, end } = taipeiDayRange();

  const [registers, warehouses, openShift, dailySales, dailyRefunds, recentSales] = await Promise.all([
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
    prisma.posShift.findFirst({
      where: { tenantId, userId: session.user.id, status: "OPEN" },
      include: { register: { select: { id: true, code: true, name: true, warehouseId: true } } },
      orderBy: { openedAt: "desc" },
    }),
    prisma.posSale.aggregate({
      where: { tenantId, status: { not: "VOIDED" }, createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.posRefund.aggregate({
      where: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: { _all: true },
    }),
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

  const grossAmount = Number(dailySales._sum.total ?? 0);
  const refundAmount = Number(dailyRefunds._sum.total ?? 0);

  return NextResponse.json({
    registers,
    warehouses,
    openShift,
    today: {
      sales: dailySales._count._all,
      refunds: dailyRefunds._count._all,
      grossAmount,
      refundAmount,
      amount: grossAmount - refundAmount,
    },
    recentSales: recentSales.map((sale) => ({
      ...sale,
      refundedTotal: sale.refunds.reduce((sum, refund) => sum + Number(refund.total), 0),
    })),
    serverTime: new Date().toISOString(),
  });
});
