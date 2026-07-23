import { after, NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { createEInvoiceOutbox, processEInvoiceEvent } from "@/lib/e-invoice";
import { hasPermission } from "@/lib/auth";
import { nextNumberFastInTransaction } from "@/lib/number-sequence";
import { drainPendingPosSales, fulfillPosSale } from "@/lib/pos-fulfillment";
import { discountApprovalFingerprint, money, resolveCheckoutOffers } from "@/lib/pos-offers";
import { prisma } from "@/lib/prisma";

const CheckoutInput = z.object({
  requestId: z.string().trim().min(16).max(100),
  shiftId: z.string().min(1),
  restaurantOrderId: z.string().min(1).optional().nullable(),
  customerId: z.string().optional().nullable(),
  exchangeRefundId: z.string().min(1).optional().nullable(),
  promotionId: z.string().min(1).optional().nullable(),
  couponCode: z.string().trim().max(30).optional().nullable(),
  redeemPoints: z.coerce.number().int().min(0).max(1_000_000).default(0),
  managerApprovalId: z.string().min(1).optional().nullable(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().positive().max(100_000),
    discount: z.coerce.number().min(0).default(0),
  })).min(1).max(200),
  payments: z.array(z.object({
    method: z.enum(["CASH", "CARD", "TRANSFER", "MOBILE"]),
    amount: z.coerce.number().positive().max(100_000_000),
    reference: z.string().max(100).optional().nullable(),
  })).min(1).max(4),
  invoice: z.object({
    mode: z.enum(["PAPER", "MOBILE_CARRIER", "CITIZEN_CERT", "DONATION", "BUSINESS"]),
    buyerTaxId: z.string().trim().max(8).optional().nullable(),
    carrierType: z.string().trim().max(20).optional().nullable(),
    carrierId: z.string().trim().max(64).optional().nullable(),
    donationCode: z.string().trim().max(7).optional().nullable(),
  }).optional().nullable(),
});

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeItems(items: Array<{ productId: string; quantity: number; discount: number }>) {
  const grouped = new Map<string, { productId: string; quantity: number; discount: number }>();
  for (const item of items) {
    const current = grouped.get(item.productId);
    if (current) {
      current.quantity += item.quantity;
      current.discount += item.discount;
    } else {
      grouped.set(item.productId, { ...item });
    }
  }
  return [...grouped.values()].map((item) => ({
    ...item,
    quantity: Math.round(item.quantity * 10_000) / 10_000,
    discount: roundMoney(item.discount),
  }));
}

const walkInCustomerIdCache = new Map<string, string>();

async function getWalkInCustomerId(tenantId: string) {
  const cached = walkInCustomerIdCache.get(tenantId);
  if (cached) return cached;
  const customer = await prisma.customer.upsert({
    where: { tenantId_code: { tenantId, code: "POS-WALKIN" } },
    update: { isActive: true },
    create: { tenantId, code: "POS-WALKIN", companyName: "門市散客" },
    select: { id: true },
  });
  walkInCustomerIdCache.set(tenantId, customer.id);
  return customer.id;
}
async function decrementCheckoutStocks(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    warehouseId: string;
    items: Array<{ productId: string; quantity: number; product: { name: string } }>;
  },
) {
  const values = input.items.map((item) => Prisma.sql`(${item.productId}, ${item.quantity}::numeric)`);
  const updated = await tx.$queryRaw<Array<{ productId: string }>>(Prisma.sql`
    WITH requested("productId", "quantity") AS (
      VALUES ${Prisma.join(values)}
    )
    UPDATE "InventoryStock" AS stock
    SET "quantity" = stock."quantity" - requested."quantity"
    FROM requested
    WHERE stock."tenantId" = ${input.tenantId}
      AND stock."warehouseId" = ${input.warehouseId}
      AND stock."productId" = requested."productId"
      AND stock."quantity" >= requested."quantity"
    RETURNING stock."productId"
  `);
  const updatedIds = new Set(updated.map((row) => row.productId));
  const missing = input.items.find((item) => !updatedIds.has(item.productId));
  if (missing) throw new ApiError(409, `${missing.product.name} 庫存不足，請補貨或調撥後再結帳`);
}

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const currentUser = (session.user as any).name || (session.user as any).username || session.user.id;
  const body = CheckoutInput.parse(await req.json());

  const normalizedItems = normalizeItems(body.items);
  const productIds = normalizedItems.map((item) => item.productId);
  const now = new Date();
  const activePromotionWindow = {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
  const [priorSale, shift, products, preloadedPromotions, walkInCustomerId] = await Promise.all([
    prisma.posSale.findFirst({ where: { tenantId, clientRequestId: body.requestId }, include: { payments: true, electronicInvoice: true } }),
    prisma.posShift.findFirst({ where: { id: body.shiftId, tenantId, userId: session.user.id, status: "OPEN" }, select: { id: true, registerId: true, register: { select: { warehouseId: true } } } }),
    prisma.product.findMany({ where: { tenantId, id: { in: productIds }, isActive: true }, select: { id: true, sku: true, name: true, salePrice: true, costPrice: true, taxRate: { select: { rate: true } } } }),
    prisma.posPromotion.findMany({ where: { tenantId, ...activePromotionWindow }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),
    body.customerId ? Promise.resolve(null) : getWalkInCustomerId(tenantId),
  ]);
  if (priorSale) return NextResponse.json({ ok: true, sale: priorSale, changeDue: Number(priorSale.changeDue), replayed: true });
  if (!shift) throw new ApiError(409, "請先開班，或目前班次已結束");
  if (products.length !== productIds.length) throw new ApiError(400, "購物車包含已停用或不存在的商品");
  const productMap = new Map(products.map((product) => [product.id, product]));
  const computedBeforeOffers = normalizedItems.map((item) => {
    const product = productMap.get(item.productId)!;
    const grossBeforeDiscount = Number(product.salePrice) * item.quantity;
    if (item.discount > grossBeforeDiscount) throw new ApiError(400, `${product.name} 的折扣不可大於商品金額`);
    return { ...item, product, gross: roundMoney(grossBeforeDiscount - item.discount), rate: Number(product.taxRate?.rate ?? 0.05) };
  });
  const baseTotal = money(computedBeforeOffers.reduce((sum, item) => sum + item.gross, 0));
  const eligiblePromotions = preloadedPromotions.filter((item: any) => Number(item.minSpend) <= baseTotal);
  if (baseTotal <= 0) throw new ApiError(400, "折扣後交易金額必須大於 0");
  const manualDiscount = money(computedBeforeOffers.reduce((sum, item) => sum + item.discount, 0));
  const tendered = roundMoney(body.payments.reduce((sum, payment) => sum + payment.amount, 0));

  const result = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-checkout-request:${tenantId}:${body.requestId}`}))`;
    const replay = await tx.posSale.findFirst({ where: { tenantId, clientRequestId: body.requestId }, include: { payments: true, electronicInvoice: true } });
    if (replay) return { sale: replay, replayed: true, eInvoiceEventId: null, electronicInvoice: replay.electronicInvoice };

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-shift:${tenantId}:${shift.id}`}))`;
    const activeShift = await tx.posShift.findFirst({ where: { id: shift.id, tenantId, userId: session.user.id, status: "OPEN" }, select: { id: true, registerId: true, register: { select: { warehouseId: true } } } });
    if (!activeShift) throw new ApiError(409, "班次已結束，請重新開班後再結帳");

    let restaurantOrder: any = null;
    if (body.restaurantOrderId) {
      restaurantOrder = await tx.restaurantOrder.findFirst({ where: { id: body.restaurantOrderId, tenantId, shiftId: activeShift.id, status: { in: ["OPEN", "SENT", "PREPARING", "READY"] } }, select: { id: true, tableId: true, items: { where: { status: { not: "CANCELLED" } }, select: { productId: true, quantity: true, status: true } } } });
      if (!restaurantOrder) throw new ApiError(409, "餐飲桌單已結帳、取消，或不屬於目前班次");
      if (restaurantOrder.items.some((item: any) => item.status === "PENDING")) throw new ApiError(409, "尚有未送廚餐點，請先送廚再結帳");
      const requested = new Map(normalizedItems.map((item) => [item.productId, item.quantity]));
      const ordered = new Map<string, number>();
      for (const item of restaurantOrder.items) ordered.set(item.productId, (ordered.get(item.productId) ?? 0) + Number(item.quantity));
      const sameItems = requested.size === ordered.size && [...requested.entries()].every(([productId, quantity]) => Math.abs((ordered.get(productId) ?? -1) - quantity) < 0.0001) && normalizedItems.every((item) => item.discount === 0);
      if (!sameItems) throw new ApiError(409, "桌單內容已變更，請重新整理後再結帳");
    }

    const posNumber = await nextNumberFastInTransaction(tx, "POS", tenantId);
    const customer = body.customerId
      ? await tx.customer.findFirst({ where: { id: body.customerId, tenantId, isActive: true }, select: { id: true } })
      : { id: walkInCustomerId! };
    if (!customer) throw new ApiError(400, "找不到指定會員／客戶");

    if (body.exchangeRefundId) {
      const exchangeRefund = await tx.posRefund.findFirst({ where: { id: body.exchangeRefundId, tenantId, status: "COMPLETED" }, select: { id: true, exchangeSale: { select: { number: true } } } });
      if (!exchangeRefund) throw new ApiError(400, "找不到指定的換貨退款單");
      if (exchangeRefund.exchangeSale) throw new ApiError(409, `此退款已連結換貨銷售 ${exchangeRefund.exchangeSale.number}`);
    }

    let loyaltyCustomer: any = null;
    if (body.customerId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-loyalty:${tenantId}:${customer.id}`}))`;
      loyaltyCustomer = await tx.customer.findUnique({ where: { id: customer.id }, select: { id: true, loyaltyPoints: true } });
    }

    let managerApproval: any = null;
    if (manualDiscount > 0 && !hasPermission(session.user.permissions, "sales.approve")) {
      if (!body.managerApprovalId) throw new ApiError(403, "手動折扣需先取得店長核准");
      const fingerprint = discountApprovalFingerprint({ shiftId: activeShift.id, items: normalizedItems });
      managerApproval = await tx.posManagerApproval.findFirst({ where: { id: body.managerApprovalId, tenantId, kind: "MANUAL_DISCOUNT", status: "APPROVED", fingerprint, consumedAt: null, expiresAt: { gte: new Date() } }, select: { id: true } });
      if (!managerApproval) throw new ApiError(409, "店長折扣核准不存在、已逾時，或購物車已變更");
    }

    const offers = await resolveCheckoutOffers(tx, { tenantId, customerId: body.customerId ? customer.id : null, baseTotal, promotionId: body.promotionId, couponCode: body.couponCode, redeemPoints: body.redeemPoints, promotions: eligiblePromotions });
    const orderOfferDiscount = money(offers.promotionDiscount + offers.couponDiscount + offers.pointsDiscount);
    let remainingAllocation = orderOfferDiscount;
    const computed = computedBeforeOffers.map((item, index) => {
      const allocated = index === computedBeforeOffers.length - 1 ? remainingAllocation : money(orderOfferDiscount * item.gross / baseTotal);
      remainingAllocation = money(remainingAllocation - allocated);
      const gross = money(item.gross - allocated);
      const net = money(gross / (1 + item.rate));
      return { ...item, gross, net, tax: money(gross - net), totalLineDiscount: money(item.discount + allocated) };
    });
    const total = money(computed.reduce((sum, item) => sum + item.gross, 0));
    const subtotal = money(computed.reduce((sum, item) => sum + item.net, 0));
    const taxAmount = money(total - subtotal);
    const discount = money(manualDiscount + orderOfferDiscount);
    const pointsEarned = loyaltyCustomer ? Math.floor(total / 100) : 0;
    if (tendered < total) throw new ApiError(400, "付款金額不足");
    if (tendered > total && !body.payments.some((payment) => payment.method === "CASH")) throw new ApiError(400, "非現金付款不可超收找零");
    const changeDue = money(tendered - total);
    let remainingChange = changeDue;
    const drawerPayments = body.payments.map((payment) => {
      if (payment.method !== "CASH" || remainingChange <= 0) return payment;
      const returned = Math.min(payment.amount, remainingChange);
      remainingChange = money(remainingChange - returned);
      return { ...payment, amount: money(payment.amount - returned) };
    });

    await decrementCheckoutStocks(tx, { tenantId, warehouseId: activeShift.register.warehouseId, items: computed.map((item) => ({ productId: item.productId, quantity: item.quantity, product: { name: item.product.name } })) });
    const sale = await tx.posSale.create({
      data: {
        tenantId, clientRequestId: body.requestId, shiftId: activeShift.id, registerId: activeShift.registerId, customerId: customer.id, exchangeRefundId: body.exchangeRefundId || null, promotionId: offers.promotion?.id || null, number: posNumber, receiptNo: posNumber, subtotal, discount, promotionDiscount: offers.promotionDiscount, couponDiscount: offers.couponDiscount, pointsDiscount: offers.pointsDiscount, loyaltyPointsRedeemed: offers.pointsRedeemed, loyaltyPointsEarned: pointsEarned, taxAmount, total, paidAmount: total, changeDue,
        items: { create: computed.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: Number(item.product.salePrice), unitCost: Number(item.product.costPrice), discount: item.totalLineDiscount, taxRate: item.rate, subtotal: item.gross })) },
        payments: { create: drawerPayments.filter((item) => item.amount > 0).map((item) => ({ method: item.method, amount: item.amount, reference: item.reference })) },
      },
      include: body.invoice ? { items: { include: { product: true } }, payments: true } : { payments: true },
    });

    if (restaurantOrder) {
      await tx.$executeRaw`
        WITH completed AS (
          UPDATE "RestaurantOrder"
          SET "status" = 'COMPLETED', "posSaleId" = ${sale.id}, "completedAt" = NOW(), "updatedAt" = NOW()
          WHERE "id" = ${restaurantOrder.id}
          RETURNING "tableId"
        )
        UPDATE "RestaurantTable" AS table_row
        SET "status" = 'AVAILABLE', "updatedAt" = NOW()
        FROM completed
        WHERE table_row."id" = completed."tableId"
      `;
    }
    const eInvoiceOutbox = body.invoice ? await createEInvoiceOutbox(tx, { tenantId, sale, request: body.invoice }) : null;
    if (offers.coupon) {
      await tx.posCoupon.update({ where: { id: offers.coupon.id }, data: { usedCount: { increment: 1 } } });
      await tx.posCouponRedemption.create({ data: { tenantId, couponId: offers.coupon.id, saleId: sale.id, customerId: body.customerId ? customer.id : null, amount: offers.couponDiscount } });
    }
    if (managerApproval) await tx.posManagerApproval.update({ where: { id: managerApproval.id }, data: { status: "CONSUMED", consumedAt: new Date(), saleId: sale.id } });
    if (loyaltyCustomer) {
      let balance = Number(loyaltyCustomer.loyaltyPoints);
      if (offers.pointsRedeemed > 0) {
        balance -= offers.pointsRedeemed;
        const deducted = await tx.customer.updateMany({ where: { id: loyaltyCustomer.id, tenantId, loyaltyPoints: { gte: offers.pointsRedeemed } }, data: { loyaltyPoints: { decrement: offers.pointsRedeemed } } });
        if (deducted.count !== 1) throw new ApiError(409, "會員點數已被其他交易使用，請重新結帳");
        await tx.customerLoyaltyTransaction.create({ data: { tenantId, customerId: loyaltyCustomer.id, saleId: sale.id, type: "REDEEM", points: -offers.pointsRedeemed, balanceAfter: balance } });
      }
      if (pointsEarned > 0) {
        balance += pointsEarned;
        await tx.customer.update({ where: { id: loyaltyCustomer.id }, data: { loyaltyPoints: { increment: pointsEarned } } });
        await tx.customerLoyaltyTransaction.create({ data: { tenantId, customerId: loyaltyCustomer.id, saleId: sale.id, type: "EARN", points: pointsEarned, balanceAfter: balance } });
      }
    }

    return { sale, replayed: false, eInvoiceEventId: eInvoiceOutbox?.eventId ?? null, electronicInvoice: eInvoiceOutbox?.invoice ?? null };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

  after(async () => {
    const jobs: Promise<unknown>[] = [fulfillPosSale(result.sale.id)];
    if (!result.replayed) jobs.push(audit({ userId: session.user.id, action: "checkout", module: "pos", refId: result.sale.id, detail: result.sale.number }));
    if (result.eInvoiceEventId) jobs.push(processEInvoiceEvent(result.eInvoiceEventId));
    const settled = await Promise.allSettled(jobs);
    for (const job of settled) {
      if (job.status === "rejected") console.error("[pos-checkout] background job failed", job.reason);
    }
    try { await drainPendingPosSales(tenantId, 3); } catch (error) { console.error("[pos-checkout] pending sync retry failed", error); }
  });

  return NextResponse.json({ ok: true, sale: { ...result.sale, electronicInvoice: result.electronicInvoice ?? (result.sale as any).electronicInvoice ?? null }, changeDue: Number(result.sale.changeDue), replayed: result.replayed, erpSync: "QUEUED" });
});
