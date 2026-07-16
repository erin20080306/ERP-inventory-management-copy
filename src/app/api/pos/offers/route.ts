import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function activeWindow(now: Date) {
  return { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] };
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  const includeAll = req.nextUrl.searchParams.get("all") === "1" && hasPermission(session.user.permissions, "sales.approve");
  const customerId = req.nextUrl.searchParams.get("customerId");
  const couponCode = req.nextUrl.searchParams.get("couponCode")?.trim().toUpperCase();
  const now = new Date();
  const [promotions, coupons, customer] = await Promise.all([
    prisma.posPromotion.findMany({ where: { tenantId, ...(includeAll ? {} : activeWindow(now)) }, orderBy: [{ priority: "desc" }, { createdAt: "desc" }] }),
    prisma.posCoupon.findMany({ where: { tenantId, ...(includeAll ? {} : { ...activeWindow(now), ...(couponCode ? { code: couponCode } : {}) }) }, orderBy: { createdAt: "desc" } }),
    customerId ? prisma.customer.findFirst({ where: { id: customerId, tenantId, isActive: true }, select: { id: true, companyName: true, loyaltyPoints: true, loyaltyTier: true } }) : null,
  ]);
  return NextResponse.json({ promotions, coupons, customer });
});

const BaseOffer = {
  code: z.string().trim().min(2).max(30).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  kind: z.enum(["PERCENT", "AMOUNT"]),
  value: z.coerce.number().positive().max(1_000_000),
  minSpend: z.coerce.number().min(0).default(0),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
};

const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SAVE_PROMOTION"), ...BaseOffer, priority: z.coerce.number().int().min(-999).max(999).default(0) }),
  z.object({ action: z.literal("SAVE_COUPON"), ...BaseOffer, maxDiscount: z.coerce.number().positive().optional().nullable(), maxUses: z.coerce.number().int().positive().optional().nullable(), perCustomerLimit: z.coerce.number().int().min(0).max(100).default(1) }),
  z.object({ action: z.enum(["TOGGLE_PROMOTION", "TOGGLE_COUPON"]), id: z.string().min(1), isActive: z.boolean() }),
]);

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("approve", "sales.approve");
  const tenantId = await requireTenantId(session);
  const body = Input.parse(await req.json());
  let item: any;
  if (body.action === "SAVE_PROMOTION") {
    if (body.kind === "PERCENT" && body.value > 100) throw new ApiError(400, "百分比促銷不可超過 100%");
    item = await prisma.posPromotion.upsert({
      where: { tenantId_code: { tenantId, code: body.code } },
      update: { name: body.name, kind: body.kind, value: body.value, minSpend: body.minSpend, priority: body.priority, startsAt: body.startsAt, endsAt: body.endsAt, isActive: body.isActive },
      create: { tenantId, code: body.code, name: body.name, kind: body.kind, value: body.value, minSpend: body.minSpend, priority: body.priority, startsAt: body.startsAt, endsAt: body.endsAt, isActive: body.isActive },
    });
  } else if (body.action === "SAVE_COUPON") {
    if (body.kind === "PERCENT" && body.value > 100) throw new ApiError(400, "百分比優惠券不可超過 100%");
    item = await prisma.posCoupon.upsert({
      where: { tenantId_code: { tenantId, code: body.code } },
      update: { name: body.name, kind: body.kind, value: body.value, minSpend: body.minSpend, maxDiscount: body.maxDiscount, maxUses: body.maxUses, perCustomerLimit: body.perCustomerLimit, startsAt: body.startsAt, endsAt: body.endsAt, isActive: body.isActive },
      create: { tenantId, code: body.code, name: body.name, kind: body.kind, value: body.value, minSpend: body.minSpend, maxDiscount: body.maxDiscount, maxUses: body.maxUses, perCustomerLimit: body.perCustomerLimit, startsAt: body.startsAt, endsAt: body.endsAt, isActive: body.isActive },
    });
  } else if (body.action === "TOGGLE_PROMOTION") {
    const existing = await prisma.posPromotion.findFirst({ where: { id: body.id, tenantId } });
    if (!existing) throw new ApiError(404, "找不到促銷");
    item = await prisma.posPromotion.update({ where: { id: existing.id }, data: { isActive: body.isActive } });
  } else {
    const existing = await prisma.posCoupon.findFirst({ where: { id: body.id, tenantId } });
    if (!existing) throw new ApiError(404, "找不到優惠券");
    item = await prisma.posCoupon.update({ where: { id: existing.id }, data: { isActive: body.isActive } });
  }
  await audit({ userId: session.user.id, action: body.action.toLowerCase(), module: "pos-offers", refId: item.id, detail: item.code });
  return NextResponse.json({ ok: true, item });
});
