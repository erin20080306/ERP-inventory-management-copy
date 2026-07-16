import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { createPostedJournal, nextNumberInTransaction } from "@/lib/documents";
import { createEInvoiceOutbox, processEInvoiceEvent } from "@/lib/e-invoice";
import { hasPermission } from "@/lib/auth";
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

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  // requirePosPermission 已取得完整 session；不要在每次結帳再做第二次
  // getServerSession + 授權查詢。
  const currentUser = (session.user as any).name || (session.user as any).username || session.user.id;
  const body = CheckoutInput.parse(await req.json());

  const priorSale = await prisma.posSale.findFirst({
    where: { tenantId, clientRequestId: body.requestId },
    include: { payments: true, electronicInvoice: true },
  });
  if (priorSale) return NextResponse.json({ ok: true, sale: priorSale, changeDue: Number(priorSale.changeDue), replayed: true });

  const shift = await prisma.posShift.findFirst({
    where: { id: body.shiftId, tenantId, userId: session.user.id, status: "OPEN" },
    include: { register: true },
  });
  if (!shift) throw new ApiError(409, "請先開班，或目前班次已結束");

  const productIds = [...new Set(body.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: productIds }, isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      salePrice: true,
      costPrice: true,
      taxRate: { select: { rate: true } },
    },
  });
  if (products.length !== productIds.length) throw new ApiError(400, "購物車包含已停用或不存在的商品");
  const productMap = new Map(products.map((product) => [product.id, product]));

  const computedBeforeOffers = body.items.map((item) => {
    const product = productMap.get(item.productId)!;
    const grossBeforeDiscount = Number(product.salePrice) * item.quantity;
    if (item.discount > grossBeforeDiscount) throw new ApiError(400, `${product.name} 的折扣不可大於商品金額`);
    const gross = Math.round((grossBeforeDiscount - item.discount) * 100) / 100;
    const rate = Number(product.taxRate?.rate ?? 0.05);
    return { ...item, product, gross, rate };
  });
  const baseTotal = money(computedBeforeOffers.reduce((sum, item) => sum + item.gross, 0));
  if (baseTotal <= 0) throw new ApiError(400, "折扣後交易金額必須大於 0");
  const manualDiscount = money(computedBeforeOffers.reduce((sum, item) => sum + item.discount, 0));
  const tendered = Math.round(body.payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;

  const result = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-checkout-request:${tenantId}:${body.requestId}`}))`;
    const replay = await tx.posSale.findFirst({
      where: { tenantId, clientRequestId: body.requestId },
      include: { payments: true, electronicInvoice: true },
    });
    if (replay) return { sale: replay, order: null, payment: null, replayed: true, eInvoiceEventId: null };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-shift:${tenantId}:${shift.id}`}))`;
    const activeShift = await tx.posShift.findFirst({
      where: { id: shift.id, tenantId, userId: session.user.id, status: "OPEN" },
      include: { register: true },
    });
    if (!activeShift) throw new ApiError(409, "班次已結束，請重新開班後再結帳");
    let restaurantOrder: any = null;
    if (body.restaurantOrderId) {
      restaurantOrder = await tx.restaurantOrder.findFirst({
        where: { id: body.restaurantOrderId, tenantId, shiftId: activeShift.id, status: { in: ["OPEN", "SENT", "PREPARING", "READY"] } },
        include: { items: { where: { status: { not: "CANCELLED" } } } },
      });
      if (!restaurantOrder) throw new ApiError(409, "餐飲桌單已結帳、取消，或不屬於目前班次");
      if (restaurantOrder.items.some((item: any) => item.status === "PENDING")) throw new ApiError(409, "尚有未送廚餐點，請先送廚再結帳");
      const requested = new Map<string, number>();
      for (const item of body.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
      const ordered = new Map<string, number>();
      for (const item of restaurantOrder.items) ordered.set(item.productId, (ordered.get(item.productId) ?? 0) + Number(item.quantity));
      const sameItems = requested.size === ordered.size
        && [...requested.entries()].every(([productId, quantity]) => Math.abs((ordered.get(productId) ?? -1) - quantity) < 0.0001)
        && body.items.every((item) => item.discount === 0);
      if (!sameItems) throw new ApiError(409, "桌單內容已變更，請重新整理後再結帳");
    }
    const soNumber = await nextNumberInTransaction(tx, "SO", tenantId);
    const paymentNumber = await nextNumberInTransaction(tx, "RP", tenantId);
    const posNumber = await nextNumberInTransaction(tx, "POS", tenantId);

    const customer = body.customerId
      ? await tx.customer.findFirst({ where: { id: body.customerId, tenantId, isActive: true } })
      : await tx.customer.upsert({
          where: { tenantId_code: { tenantId, code: "POS-WALKIN" } },
          update: { isActive: true },
          create: { tenantId, code: "POS-WALKIN", companyName: "門市散客" },
        });
    if (!customer) throw new ApiError(400, "找不到指定會員／客戶");

    if (body.exchangeRefundId) {
      const exchangeRefund = await tx.posRefund.findFirst({
        where: { id: body.exchangeRefundId, tenantId, status: "COMPLETED" },
        include: { exchangeSale: { select: { id: true, number: true } } },
      });
      if (!exchangeRefund) throw new ApiError(400, "找不到指定的換貨退款單");
      if (exchangeRefund.exchangeSale) throw new ApiError(409, `此退款已連結換貨銷售 ${exchangeRefund.exchangeSale.number}`);
    }

    let loyaltyCustomer: any = null;
    if (body.customerId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-loyalty:${tenantId}:${customer.id}`}))`;
      loyaltyCustomer = await tx.customer.findUnique({ where: { id: customer.id } });
    }

    let managerApproval: any = null;
    if (manualDiscount > 0 && !hasPermission(session.user.permissions, "sales.approve")) {
      if (!body.managerApprovalId) throw new ApiError(403, "手動折扣需先取得店長核准");
      const fingerprint = discountApprovalFingerprint({ shiftId: activeShift.id, items: body.items });
      managerApproval = await tx.posManagerApproval.findFirst({
        where: { id: body.managerApprovalId, tenantId, kind: "MANUAL_DISCOUNT", status: "APPROVED", fingerprint, consumedAt: null, expiresAt: { gte: new Date() } },
      });
      if (!managerApproval) throw new ApiError(409, "店長折扣核准不存在、已逾時，或購物車已變更");
    }

    const offers = await resolveCheckoutOffers(tx, {
      tenantId,
      customerId: body.customerId ? customer.id : null,
      baseTotal,
      promotionId: body.promotionId,
      couponCode: body.couponCode,
      redeemPoints: body.redeemPoints,
    });
    const orderOfferDiscount = money(offers.promotionDiscount + offers.couponDiscount + offers.pointsDiscount);
    let remainingAllocation = orderOfferDiscount;
    const computed = computedBeforeOffers.map((item, index) => {
      const allocated = index === computedBeforeOffers.length - 1
        ? remainingAllocation
        : money(orderOfferDiscount * item.gross / baseTotal);
      remainingAllocation = money(remainingAllocation - allocated);
      const gross = money(item.gross - allocated);
      const net = money(gross / (1 + item.rate));
      const tax = money(gross - net);
      return { ...item, gross, net, tax, allocatedOfferDiscount: allocated, totalLineDiscount: money(item.discount + allocated) };
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

    for (const item of computed) {
      const updated = await tx.inventoryStock.updateMany({
        where: {
          tenantId,
          warehouseId: activeShift.register.warehouseId,
          productId: item.productId,
          quantity: { gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity } },
      });
      if (updated.count !== 1) throw new ApiError(409, `${item.product.name} 庫存不足，請補貨或調撥後再結帳`);
    }

    const order = await tx.salesOrder.create({
      data: {
        tenantId,
        number: soNumber,
        customerId: customer.id,
        warehouseId: activeShift.register.warehouseId,
        status: "POSTED",
        subtotal,
        discount: 0,
        taxAmount,
        total,
        isTaxable: true,
        shippedAt: new Date(),
        remark: `POS ${posNumber}`,
        updatedBy: currentUser,
        items: {
          create: computed.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            shippedQty: item.quantity,
            unitPrice: item.net / item.quantity,
            discount: 0,
            taxRate: item.rate,
            subtotal: item.net,
          })),
        },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    const receivable = await tx.accountsReceivable.create({
      data: {
        tenantId,
        customerId: customer.id,
        salesOrderId: order.id,
        amount: total,
        paidAmount: total,
        status: "PAID",
        updatedBy: currentUser,
      },
    });
    const payment = await tx.receivePayment.create({
      data: {
        tenantId,
        number: paymentNumber,
        customerId: customer.id,
        receivableId: receivable.id,
        amount: total,
        method: body.payments.length > 1 ? "MIXED" : body.payments[0].method,
        remark: `POS ${posNumber}`,
        updatedBy: currentUser,
      },
    });

    const sale = await tx.posSale.create({
      data: {
        tenantId,
        clientRequestId: body.requestId,
        shiftId: activeShift.id,
        registerId: activeShift.registerId,
        customerId: customer.id,
        salesOrderId: order.id,
        exchangeRefundId: body.exchangeRefundId || null,
        promotionId: offers.promotion?.id || null,
        number: posNumber,
        receiptNo: posNumber,
        subtotal,
        discount,
        promotionDiscount: offers.promotionDiscount,
        couponDiscount: offers.couponDiscount,
        pointsDiscount: offers.pointsDiscount,
        loyaltyPointsRedeemed: offers.pointsRedeemed,
        loyaltyPointsEarned: pointsEarned,
        taxAmount,
        total,
        paidAmount: total,
        changeDue,
        items: {
          create: computed.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: Number(item.product.salePrice),
            unitCost: Number(item.product.costPrice),
            discount: item.totalLineDiscount,
            taxRate: item.rate,
            subtotal: item.gross,
          })),
        },
        // POS 付款表記錄錢櫃實收；找零另存 changeDue，避免日結現金被高估。
        payments: { create: drawerPayments.filter((item) => item.amount > 0).map((item) => ({ method: item.method, amount: item.amount, reference: item.reference })) },
      },
      include: { items: { include: { product: true } }, payments: true },
    });

    if (restaurantOrder) {
      await tx.restaurantOrder.update({ where: { id: restaurantOrder.id }, data: { status: "COMPLETED", posSaleId: sale.id, completedAt: new Date() } });
      await tx.restaurantTable.update({ where: { id: restaurantOrder.tableId }, data: { status: "AVAILABLE" } });
    }

    const eInvoiceOutbox = body.invoice
      ? await createEInvoiceOutbox(tx, { tenantId, sale, request: body.invoice })
      : null;

    if (offers.coupon) {
      await tx.posCoupon.update({ where: { id: offers.coupon.id }, data: { usedCount: { increment: 1 } } });
      await tx.posCouponRedemption.create({
        data: { tenantId, couponId: offers.coupon.id, saleId: sale.id, customerId: body.customerId ? customer.id : null, amount: offers.couponDiscount },
      });
    }
    if (managerApproval) {
      await tx.posManagerApproval.update({
        where: { id: managerApproval.id },
        data: { status: "CONSUMED", consumedAt: new Date(), saleId: sale.id },
      });
    }
    if (loyaltyCustomer) {
      let balance = Number(loyaltyCustomer.loyaltyPoints);
      if (offers.pointsRedeemed > 0) {
        balance -= offers.pointsRedeemed;
        const deducted = await tx.customer.updateMany({
          where: { id: loyaltyCustomer.id, tenantId, loyaltyPoints: { gte: offers.pointsRedeemed } },
          data: { loyaltyPoints: { decrement: offers.pointsRedeemed } },
        });
        if (deducted.count !== 1) throw new ApiError(409, "會員點數已被其他交易使用，請重新結帳");
        await tx.customerLoyaltyTransaction.create({ data: { tenantId, customerId: loyaltyCustomer.id, saleId: sale.id, type: "REDEEM", points: -offers.pointsRedeemed, balanceAfter: balance } });
      }
      if (pointsEarned > 0) {
        balance += pointsEarned;
        await tx.customer.update({ where: { id: loyaltyCustomer.id }, data: { loyaltyPoints: { increment: pointsEarned } } });
        await tx.customerLoyaltyTransaction.create({ data: { tenantId, customerId: loyaltyCustomer.id, saleId: sale.id, type: "EARN", points: pointsEarned, balanceAfter: balance } });
      }
    }

    await tx.inventoryTransaction.createMany({
      data: computed.map((item) => ({
        tenantId,
        productId: item.productId,
        warehouseId: activeShift.register.warehouseId,
        type: "SALES_OUT",
        quantity: item.quantity * -1,
        unitCost: Number(item.product.costPrice),
        refType: "POS",
        refId: sale.id,
        remark: `POS 結帳 ${posNumber}`,
      })),
    });
    const cogs = Math.round(computed.reduce(
      (sum, item) => sum + item.quantity * Number(item.product.costPrice),
      0,
    ) * 100) / 100;
    await createPostedJournal(tx, tenantId, `POS 銷售 ${posNumber}`, session.user.id, [
      { code: "1132", debit: total, memo: `應收帳款－${posNumber}` },
      { code: "4101", credit: subtotal, memo: `銷貨收入－${posNumber}` },
      { code: "2111", credit: taxAmount, memo: `銷項稅額－${posNumber}` },
      { code: "5101", debit: cogs, memo: `銷貨成本－${posNumber}` },
      { code: "1201", credit: cogs, memo: `存貨－${posNumber}` },
    ]);
    await createPostedJournal(tx, tenantId, `POS 收款 ${posNumber}`, session.user.id, [
      ...drawerPayments.filter((item) => item.amount > 0).map((item) => ({
        code: item.method === "CASH" ? "1101" : "1103",
        debit: item.amount,
        memo: `${item.method} 收款－${posNumber}`,
      })),
      { code: "1132", credit: total, memo: `沖應收帳款－${posNumber}` },
    ]);
    return { sale, order, payment, replayed: false, eInvoiceEventId: eInvoiceOutbox?.eventId ?? null };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

  if (!result.replayed) await audit({ userId: session.user.id, action: "checkout", module: "pos", refId: result.sale.id, detail: result.sale.number });

  const processedEvent = result.eInvoiceEventId
    ? await processEInvoiceEvent(result.eInvoiceEventId)
    : null;
  const electronicInvoice = processedEvent?.invoice
    ?? (result.sale as any).electronicInvoice
    ?? null;

  return NextResponse.json({
    ok: true,
    sale: { ...result.sale, electronicInvoice },
    changeDue: Number(result.sale.changeDue),
    replayed: result.replayed,
  });
});
