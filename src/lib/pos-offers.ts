import { createHash } from "node:crypto";
import { ApiError } from "./api";

export type DiscountableOffer = { kind: "PERCENT" | "AMOUNT"; value: unknown; maxDiscount?: unknown | null };

export function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function offerDiscount(offer: DiscountableOffer, amount: number) {
  const raw = offer.kind === "PERCENT" ? amount * Number(offer.value) / 100 : Number(offer.value);
  const capped = offer.maxDiscount == null ? raw : Math.min(raw, Number(offer.maxDiscount));
  return money(Math.max(0, Math.min(amount, capped)));
}

export function discountApprovalFingerprint(input: {
  shiftId: string;
  items: Array<{ productId: string; quantity: number; discount: number }>;
}) {
  const canonical = {
    shiftId: input.shiftId,
    items: input.items
      .map((item) => ({ productId: item.productId, quantity: Number(item.quantity.toFixed(4)), discount: money(item.discount) }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export async function resolveCheckoutOffers(tx: any, input: {
  tenantId: string;
  customerId?: string | null;
  baseTotal: number;
  promotionId?: string | null;
  couponCode?: string | null;
  redeemPoints?: number;
  promotions?: any[];
}) {
  const now = new Date();
  const activeWindow = {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
  const promotions = (input.promotions ?? await tx.posPromotion.findMany({
    where: { tenantId: input.tenantId, ...activeWindow, minSpend: { lte: input.baseTotal } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  })).filter((item: any) => Number(item.minSpend) <= input.baseTotal);
  let promotion = input.promotionId
    ? promotions.find((item: any) => item.id === input.promotionId)
    : null;
  if (input.promotionId && !promotion) throw new ApiError(409, "指定促銷已失效或未達門檻，請重新計算");
  if (!promotion) {
    promotion = promotions
      .map((item: any) => ({ item, discount: offerDiscount(item, input.baseTotal) }))
      .sort((a: any, b: any) => b.discount - a.discount || b.item.priority - a.item.priority)[0]?.item ?? null;
  }
  const promotionDiscount = promotion ? offerDiscount(promotion, input.baseTotal) : 0;
  let remaining = money(input.baseTotal - promotionDiscount);

  let coupon: any = null;
  let couponDiscount = 0;
  if (input.couponCode?.trim()) {
    coupon = await tx.posCoupon.findFirst({
      where: { tenantId: input.tenantId, code: input.couponCode.trim().toUpperCase(), ...activeWindow },
    });
    if (!coupon) throw new ApiError(409, "優惠券不存在、未生效或已過期");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-coupon:${input.tenantId}:${coupon.id}`}))`;
    coupon = await tx.posCoupon.findUnique({ where: { id: coupon.id } });
    if (!coupon?.isActive) throw new ApiError(409, "優惠券已停用");
    if (Number(coupon.minSpend) > input.baseTotal) throw new ApiError(409, `優惠券需消費滿 ${Number(coupon.minSpend)} 元`);
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new ApiError(409, "優惠券已達使用上限");
    if (input.customerId && coupon.perCustomerLimit > 0) {
      const prior = await tx.posCouponRedemption.count({ where: { couponId: coupon.id, customerId: input.customerId } });
      if (prior >= coupon.perCustomerLimit) throw new ApiError(409, "此會員已達優惠券使用上限");
    }
    couponDiscount = offerDiscount(coupon, remaining);
    remaining = money(remaining - couponDiscount);
  }

  let customer: any = null;
  let pointsRedeemed = 0;
  if (input.redeemPoints) {
    if (!input.customerId) throw new ApiError(400, "兌換點數前必須選擇會員");
    customer = await tx.customer.findFirst({ where: { id: input.customerId, tenantId: input.tenantId, isActive: true } });
    if (!customer) throw new ApiError(400, "找不到會員資料");
    pointsRedeemed = Math.max(0, Math.floor(input.redeemPoints));
    if (pointsRedeemed > customer.loyaltyPoints) throw new ApiError(409, "會員點數不足，請重新載入會員資料");
    if (pointsRedeemed > Math.floor(remaining)) throw new ApiError(409, "折抵點數不可超過本筆剩餘金額");
    remaining = money(remaining - pointsRedeemed);
  }
  return {
    promotion,
    coupon,
    customer,
    promotionDiscount,
    couponDiscount,
    pointsDiscount: pointsRedeemed,
    pointsRedeemed,
    total: remaining,
  };
}
