import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const ShiftAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("OPEN"), registerId: z.string().min(1), openingCash: z.coerce.number().min(0).max(10_000_000) }),
  z.object({ action: z.literal("PREVIEW"), shiftId: z.string().min(1) }),
  z.object({ action: z.literal("CLOSE"), shiftId: z.string().min(1), closingCash: z.coerce.number().min(0).max(10_000_000) }),
]);

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const body = ShiftAction.parse(await req.json());

  if (body.action === "OPEN") {
    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-user-shift:${tenantId}:${session.user.id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-register:${tenantId}:${body.registerId}`}))`;
      const register = await tx.posRegister.findFirst({ where: { id: body.registerId, tenantId, isActive: true } });
      if (!register) throw new ApiError(404, "找不到可用收銀台");
      const existingForUser = await tx.posShift.findFirst({
        where: { tenantId, userId: session.user.id, status: "OPEN" },
      });
      if (existingForUser) return { shift: existingForUser, register, reused: true };
      const occupied = await tx.posShift.findFirst({ where: { registerId: register.id, status: "OPEN" } });
      if (occupied) throw new ApiError(409, "此收銀台已有未結班班次");
      const shift = await tx.posShift.create({
        data: { tenantId, registerId: register.id, userId: session.user.id, openingCash: body.openingCash },
      });
      return { shift, register, reused: false };
    }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
    if (!result.reused) await audit({ userId: session.user.id, action: "open_shift", module: "pos", refId: result.shift.id, detail: result.register.code });
    return NextResponse.json({ ok: true, shift: result.shift, reused: result.reused });
  }

  const isClosing = body.action === "CLOSE";
  const closingCash = isClosing ? body.closingCash : null;
  const result = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-shift:${tenantId}:${body.shiftId}`}))`;
    const shift = await tx.posShift.findFirst({
      where: { id: body.shiftId, tenantId, userId: session.user.id, status: "OPEN" },
    });
    if (!shift) throw new ApiError(404, "找不到你的未結班班次");

    const [salesPayments, refundPayments, salesTotal, refundsTotal, cashMovements, pendingMovementCount, heldSaleCount, draftCount, restaurantOrderCount] = await Promise.all([
      tx.posPayment.groupBy({
        by: ["method"],
        where: { sale: { shiftId: shift.id, status: { not: "VOIDED" } } },
        _sum: { amount: true },
      }),
      tx.posRefundPayment.groupBy({
        by: ["method"],
        where: { refund: { shiftId: shift.id, status: "COMPLETED" } },
        _sum: { amount: true },
      }),
      tx.posSale.aggregate({
        where: { shiftId: shift.id, status: { not: "VOIDED" } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      tx.posRefund.aggregate({
        where: { shiftId: shift.id, status: "COMPLETED" },
        _sum: { total: true },
        _count: { _all: true },
      }),
      tx.posCashMovement.groupBy({
        by: ["type"],
        where: { shiftId: shift.id, status: "APPROVED" },
        _sum: { amount: true },
      }),
      tx.posCashMovement.count({ where: { shiftId: shift.id, status: "PENDING" } }),
      tx.posHeldSale.count({ where: { shiftId: shift.id, status: "HELD" } }),
      tx.posCartDraft.count({ where: { shiftId: shift.id } }),
      tx.restaurantOrder.count({
        where: { shiftId: shift.id, status: { in: ["OPEN", "SENT", "PREPARING", "READY"] } },
      }),
    ]);
    if (isClosing && pendingMovementCount > 0) throw new ApiError(409, `尚有 ${pendingMovementCount} 筆錢櫃異動待主管處理`);
    if (isClosing && heldSaleCount > 0) throw new ApiError(409, `尚有 ${heldSaleCount} 筆暫存交易，請先取回或取消`);
    if (isClosing && draftCount > 0) throw new ApiError(409, "仍有停電復原草稿，請先完成、暫存或清空購物車");
    if (isClosing && restaurantOrderCount > 0) throw new ApiError(409, `尚有 ${restaurantOrderCount} 桌餐飲單未結帳或取消`);
    const methodMap = new Map<string, { sales: number; refunds: number; net: number }>();
    for (const row of salesPayments) {
      const sales = Number(row._sum.amount ?? 0);
      methodMap.set(row.method, { sales, refunds: 0, net: sales });
    }
    for (const row of refundPayments) {
      const refunds = Number(row._sum.amount ?? 0);
      const current = methodMap.get(row.method) ?? { sales: 0, refunds: 0, net: 0 };
      methodMap.set(row.method, { ...current, refunds, net: current.sales - refunds });
    }
    const cash = methodMap.get("CASH") ?? { sales: 0, refunds: 0, net: 0 };
    const movementTotals = { paidIn: 0, paidOut: 0, safeDrop: 0 };
    for (const movement of cashMovements) {
      const amount = Number(movement._sum.amount ?? 0);
      if (movement.type === "PAID_IN") movementTotals.paidIn += amount;
      if (movement.type === "PAID_OUT") movementTotals.paidOut += amount;
      if (movement.type === "SAFE_DROP") movementTotals.safeDrop += amount;
    }
    const expectedCash = Math.round((Number(shift.openingCash) + cash.net + movementTotals.paidIn - movementTotals.paidOut - movementTotals.safeDrop) * 100) / 100;
    const difference = closingCash === null ? null : Math.round((closingCash - expectedCash) * 100) / 100;
    const closed = isClosing
      ? await tx.posShift.update({
          where: { id: shift.id },
          data: {
            status: "CLOSED",
            expectedCash,
            closingCash,
            difference,
            closedAt: new Date(),
          },
        })
      : shift;
    return {
      closed,
      summary: {
        openingCash: Number(shift.openingCash),
        expectedCash,
        closingCash,
        difference,
        grossSales: Number(salesTotal._sum.total ?? 0),
        refunds: Number(refundsTotal._sum.total ?? 0),
        netSales: Number(salesTotal._sum.total ?? 0) - Number(refundsTotal._sum.total ?? 0),
        saleCount: salesTotal._count._all,
        refundCount: refundsTotal._count._all,
        payments: [...methodMap.entries()].map(([method, values]) => ({ method, ...values })),
        cashMovements: movementTotals,
        pendingMovementCount,
        heldSaleCount,
        draftCount,
        restaurantOrderCount,
      },
    };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
  if (!isClosing) return NextResponse.json({ ok: true, preview: true, shift: result.closed, summary: result.summary });
  await audit({
    userId: session.user.id,
    action: "close_shift",
    module: "pos",
    refId: result.closed.id,
    detail: `應有 ${result.summary.expectedCash}；實點 ${closingCash}；差額 ${result.summary.difference}`,
  });
  return NextResponse.json({ ok: true, shift: result.closed, summary: result.summary });
});
