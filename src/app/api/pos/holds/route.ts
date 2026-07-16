import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { PosCartPayloadSchema } from "@/lib/pos-cart";
import { prisma } from "@/lib/prisma";

const HoldInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("HOLD"), shiftId: z.string().min(1), label: z.string().trim().min(1).max(60), payload: PosCartPayloadSchema }),
  z.object({ action: z.enum(["RESUME", "CANCEL"]), holdId: z.string().min(1), shiftId: z.string().min(1) }),
]);

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const shiftId = (req.nextUrl.searchParams.get("shiftId") ?? "").trim();
  const shift = await prisma.posShift.findFirst({ where: { id: shiftId, tenantId, userId: session.user.id, status: "OPEN" }, select: { id: true } });
  if (!shift) throw new ApiError(404, "找不到你的未結班班次");
  const items = await prisma.posHeldSale.findMany({ where: { tenantId, shiftId, status: "HELD" }, orderBy: { createdAt: "asc" }, take: 20 });
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const body = HoldInput.parse(await req.json());
  const shift = await prisma.posShift.findFirst({ where: { id: body.shiftId, tenantId, userId: session.user.id, status: "OPEN" }, select: { id: true, registerId: true } });
  if (!shift) throw new ApiError(409, "只能操作自己的未結班班次");

  if (body.action === "HOLD") {
    if (body.payload.items.length === 0) throw new ApiError(400, "購物車是空的，無法暫存");
    const count = await prisma.posHeldSale.count({ where: { shiftId: shift.id, status: "HELD" } });
    if (count >= 20) throw new ApiError(409, "此班次已有 20 筆暫存單，請先取回或取消");
    const hold = await prisma.posHeldSale.create({ data: { tenantId, shiftId: shift.id, registerId: shift.registerId, label: body.label, payload: body.payload, createdById: session.user.id } });
    await prisma.posCartDraft.deleteMany({ where: { tenantId, shiftId: shift.id, userId: session.user.id } });
    await audit({ userId: session.user.id, action: "hold_sale", module: "pos", refId: hold.id, detail: hold.label });
    return NextResponse.json({ ok: true, hold });
  }

  const result = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-held-sale:${tenantId}:${body.holdId}`}))`;
    const hold = await tx.posHeldSale.findFirst({ where: { id: body.holdId, tenantId, shiftId: shift.id, status: "HELD" } });
    if (!hold) throw new ApiError(409, "暫存單已被取回、取消或不存在");
    const status = body.action === "RESUME" ? "RESUMED" : "CANCELLED";
    const updated = await tx.posHeldSale.update({ where: { id: hold.id }, data: { status, resumedById: session.user.id, resumedAt: new Date() } });
    return { updated, payload: hold.payload };
  });
  await audit({ userId: session.user.id, action: body.action === "RESUME" ? "resume_held_sale" : "cancel_held_sale", module: "pos", refId: result.updated.id, detail: result.updated.label });
  return NextResponse.json({ ok: true, hold: result.updated, payload: body.action === "RESUME" ? result.payload : undefined });
});
