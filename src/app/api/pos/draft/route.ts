import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { PosCartPayloadSchema } from "@/lib/pos-cart";
import { prisma } from "@/lib/prisma";

const DraftInput = z.object({
  shiftId: z.string().min(1),
  payload: PosCartPayloadSchema,
  baseRevision: z.number().int().min(0).nullable().optional(),
});

async function activeShift(tenantId: string, userId: string, shiftId: string) {
  const shift = await prisma.posShift.findFirst({ where: { id: shiftId, tenantId, userId, status: "OPEN" }, select: { id: true } });
  if (!shift) throw new ApiError(409, "找不到你的未結班班次");
  return shift;
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const shiftId = (req.nextUrl.searchParams.get("shiftId") ?? "").trim();
  await activeShift(tenantId, session.user.id, shiftId);
  const draft = await prisma.posCartDraft.findUnique({ where: { tenantId_shiftId_userId: { tenantId, shiftId, userId: session.user.id } } });
  return NextResponse.json({ draft });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const body = DraftInput.parse(await req.json());
  await activeShift(tenantId, session.user.id, body.shiftId);
  if (body.payload.items.length === 0) {
    await prisma.posCartDraft.deleteMany({ where: { tenantId, shiftId: body.shiftId, userId: session.user.id } });
    return NextResponse.json({ ok: true, cleared: true });
  }
  const draft = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-cart-draft:${tenantId}:${body.shiftId}:${session.user.id}`}))`;
    const current = await tx.posCartDraft.findUnique({ where: { tenantId_shiftId_userId: { tenantId, shiftId: body.shiftId, userId: session.user.id } } });
    if (current && body.baseRevision != null && body.baseRevision !== current.revision) {
      throw new ApiError(409, `草稿已在另一台工作站更新（伺服器版本 ${current.revision}），請先選擇要取回的版本`);
    }
    if (current) return tx.posCartDraft.update({ where: { id: current.id }, data: { payload: body.payload, revision: { increment: 1 } } });
    if (body.baseRevision != null && body.baseRevision > 0) throw new ApiError(409, "伺服器草稿已被清除，請重新確認目前購物車");
    return tx.posCartDraft.create({ data: { tenantId, shiftId: body.shiftId, userId: session.user.id, payload: body.payload, revision: 1 } });
  });
  return NextResponse.json({ ok: true, draft: { id: draft.id, updatedAt: draft.updatedAt, revision: draft.revision } });
});

export const DELETE = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const shiftId = (req.nextUrl.searchParams.get("shiftId") ?? "").trim();
  await prisma.posCartDraft.deleteMany({ where: { tenantId, shiftId, userId: session.user.id } });
  return NextResponse.json({ ok: true });
});
