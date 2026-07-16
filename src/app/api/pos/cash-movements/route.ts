import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const MovementInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("REQUEST"), shiftId: z.string().min(1), type: z.enum(["PAID_IN", "PAID_OUT", "SAFE_DROP"]), amount: z.coerce.number().positive().max(10_000_000), reason: z.string().trim().min(2).max(300) }),
  z.object({ action: z.enum(["APPROVE", "REJECT"]), movementId: z.string().min(1) }),
]);

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const shiftId = (req.nextUrl.searchParams.get("shiftId") ?? "").trim();
  if (!shiftId) throw new ApiError(400, "缺少班次");
  const shift = await prisma.posShift.findFirst({ where: { id: shiftId, tenantId }, select: { id: true } });
  if (!shift) throw new ApiError(404, "找不到班次");
  const items = await prisma.posCashMovement.findMany({ where: { tenantId, shiftId }, orderBy: { requestedAt: "desc" }, take: 100 });
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const baseSession = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(baseSession);
  const body = MovementInput.parse(await req.json());

  if (body.action === "REQUEST") {
    const shift = await prisma.posShift.findFirst({ where: { id: body.shiftId, tenantId, userId: baseSession.user.id, status: "OPEN" }, select: { id: true, registerId: true } });
    if (!shift) throw new ApiError(409, "只能對自己的未結班班次申請錢櫃異動");
    const movement = await prisma.posCashMovement.create({
      data: { tenantId, shiftId: shift.id, registerId: shift.registerId, type: body.type, amount: body.amount, reason: body.reason, requestedById: baseSession.user.id },
    });
    await audit({ userId: baseSession.user.id, action: "request_cash_movement", module: "pos", refId: movement.id, detail: `${body.type} ${body.amount}；${body.reason}` });
    return NextResponse.json({ ok: true, movement, message: "申請已送出，需由具現金核准權限的主管確認" });
  }

  const manager = await requirePosPermission("approve", "cash.approve");
  const movement = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-cash-movement:${tenantId}:${body.movementId}`}))`;
    const current = await tx.posCashMovement.findFirst({ where: { id: body.movementId, tenantId, status: "PENDING" }, include: { shift: { select: { status: true } } } });
    if (!current) throw new ApiError(409, "此錢櫃申請已處理或不存在");
    if (current.shift.status !== "OPEN") throw new ApiError(409, "班次已結束，無法核准錢櫃異動");
    return tx.posCashMovement.update({
      where: { id: current.id },
      data: { status: body.action === "APPROVE" ? "APPROVED" : "REJECTED", approvedById: manager.user.id, decidedAt: new Date() },
    });
  });
  await audit({ userId: manager.user.id, action: body.action === "APPROVE" ? "approve_cash_movement" : "reject_cash_movement", module: "pos", refId: movement.id, detail: `${movement.type} ${movement.amount}` });
  return NextResponse.json({ ok: true, movement });
});
