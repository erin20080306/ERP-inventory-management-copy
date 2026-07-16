import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { discountApprovalFingerprint } from "@/lib/pos-offers";
import { prisma } from "@/lib/prisma";

const CartSchema = z.object({
  shiftId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().positive(), discount: z.coerce.number().min(0) })).min(1),
  reason: z.string().trim().min(2).max(300),
});

const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("REQUEST"), cart: CartSchema }),
  z.object({ action: z.enum(["APPROVE", "REJECT"]), approvalId: z.string().min(1), reason: z.string().trim().max(300).optional() }),
]);

export const GET = apiHandler(async () => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  await prisma.posManagerApproval.updateMany({
    where: { tenantId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  const items = await prisma.posManagerApproval.findMany({
    where: { tenantId, kind: "MANUAL_DISCOUNT", status: { in: ["PENDING", "APPROVED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = Input.parse(await req.json());
  if (body.action === "REQUEST") {
    const session = await requirePosPermission("create", "sales.create");
    const tenantId = await requireTenantId(session);
    const shift = await prisma.posShift.findFirst({ where: { id: body.cart.shiftId, tenantId, userId: session.user.id, status: "OPEN" } });
    if (!shift) throw new ApiError(409, "目前沒有可申請折扣的開放班次");
    if (!body.cart.items.some((item) => item.discount > 0)) throw new ApiError(400, "購物車沒有需要主管核准的手動折扣");
    const fingerprint = discountApprovalFingerprint(body.cart);
    const approval = await prisma.posManagerApproval.create({
      data: {
        tenantId,
        kind: "MANUAL_DISCOUNT",
        fingerprint,
        payload: body.cart,
        requestedById: session.user.id,
        reason: body.cart.reason,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    await audit({ userId: session.user.id, action: "request", module: "pos-discount", refId: approval.id, detail: body.cart.reason });
    return NextResponse.json({ ok: true, approval, message: "折扣申請已送出，15 分鐘內需由另一位店長核准" });
  }

  const manager = await requirePosPermission("approve", "sales.approve");
  const tenantId = await requireTenantId(manager);
  const approval = await prisma.posManagerApproval.findFirst({ where: { id: body.approvalId, tenantId, status: "PENDING" } });
  if (!approval) throw new ApiError(404, "找不到待核准折扣，或申請已處理");
  if (approval.expiresAt < new Date()) {
    await prisma.posManagerApproval.update({ where: { id: approval.id }, data: { status: "EXPIRED" } });
    throw new ApiError(409, "折扣申請已逾時，請重新申請");
  }
  if (approval.requestedById === manager.user.id) throw new ApiError(409, "申請人不可核准自己的折扣，請由另一位店長處理");
  const updated = await prisma.posManagerApproval.update({
    where: { id: approval.id },
    data: { status: body.action === "APPROVE" ? "APPROVED" : "REJECTED", decidedById: manager.user.id, decidedAt: new Date(), reason: body.reason || approval.reason },
  });
  await audit({ userId: manager.user.id, action: body.action.toLowerCase(), module: "pos-discount", refId: approval.id, detail: body.reason });
  return NextResponse.json({ ok: true, approval: updated });
});
