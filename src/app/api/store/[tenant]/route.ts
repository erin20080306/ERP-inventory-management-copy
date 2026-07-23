import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, getClientInfo } from "@/lib/api";
import { nextNumberInTransaction } from "@/lib/documents";
import { computeLicenseAccess } from "@/lib/license";
import { prisma } from "@/lib/prisma";

const CheckoutInput = z.object({
  requestId: z.string().uuid(),
  customer: z.object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(6).max(30),
    address: z.string().trim().max(300).default(""),
  }),
  delivery: z.enum(["HOME", "PICKUP"]),
  payment: z.enum(["CARD", "MOBILE", "TRANSFER"]),
  items: z.array(z.object({
    productId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(20),
    size: z.string().trim().max(40).optional(),
    color: z.string().trim().max(40).optional(),
  })).min(1).max(50),
});

const checkoutAttempts = new Map<string, { count: number; resetAt: number }>();

function allowCheckout(req: NextRequest) {
  const { ip } = getClientInfo(req);
  const key = ip.split(",")[0].trim();
  const now = Date.now();
  const current = checkoutAttempts.get(key);
  if (!current || current.resetAt <= now) {
    checkoutAttempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (current.count >= 15) return false;
  current.count += 1;
  return true;
}

async function getCommerceTenant(rawKey: string) {
  const key = decodeURIComponent(rawKey).trim();
  if (!key || key.length > 100) throw new ApiError(404, "找不到商城");
  const tenant = await prisma.tenant.findFirst({
    where: {
      isInternal: false,
      businessMode: "ECOMMERCE",
      OR: [
        { id: key },
        { companyCode: key.toUpperCase() },
      ],
    },
    select: {
      id: true,
      name: true,
      companyCode: true,
      createdAt: true,
      licensePlan: true,
      licenseBilling: true,
      licenseStatus: true,
      licenseSeatLimit: true,
      licenseActivatedAt: true,
      licenseExpiresAt: true,
      licenseKeyHash: true,
      licenseVersion: true,
    },
  });
  if (!tenant) throw new ApiError(404, "找不到已啟用的電商租戶");
  const access = computeLicenseAccess({
    tenantCreatedAt: tenant.createdAt,
    licensePlan: tenant.licensePlan,
    licenseBilling: tenant.licenseBilling,
    licenseStatus: tenant.licenseStatus,
    licenseSeatLimit: tenant.licenseSeatLimit,
    licenseActivatedAt: tenant.licenseActivatedAt,
    licenseExpiresAt: tenant.licenseExpiresAt,
    licenseKeyHash: tenant.licenseKeyHash,
    licenseVersion: tenant.licenseVersion,
  });
  return { tenant, access };
}

function reservedByProduct(lines: Array<{ productId: string; quantity: unknown; shippedQty: unknown }>) {
  const reserved = new Map<string, number>();
  for (const line of lines) {
    const open = Math.max(0, Number(line.quantity) - Number(line.shippedQty));
    reserved.set(line.productId, (reserved.get(line.productId) ?? 0) + open);
  }
  return reserved;
}

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant, access } = await getCommerceTenant(params.tenant);
  const [products, pendingLines] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: [{ category: { name: "asc" } }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        sku: true,
        name: true,
        spec: true,
        description: true,
        imageUrl: true,
        salePrice: true,
        category: { select: { name: true } },
        stocks: { select: { quantity: true } },
      },
    }),
    prisma.salesOrderItem.findMany({
      where: {
        order: {
          tenantId: tenant.id,
          status: { in: ["SUBMITTED", "APPROVED", "PARTIALLY_SHIPPED"] },
          remark: { startsWith: "[WEB]" },
        },
      },
      select: { productId: true, quantity: true, shippedQty: true },
    }),
  ]);
  const reserved = reservedByProduct(pendingLines);
  return NextResponse.json({
    tenant: { name: tenant.name, code: tenant.companyCode },
    acceptingOrders: access.allowed,
    accessMessage: access.allowed ? null : access.reason,
    products: products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      spec: product.spec,
      description: product.description,
      image: product.imageUrl,
      category: product.category?.name ?? "商品",
      price: Number(product.salePrice),
      stock: Math.max(0, product.stocks.reduce((sum, row) => sum + Number(row.quantity), 0) - (reserved.get(product.id) ?? 0)),
    })),
  }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  if (!allowCheckout(req)) throw new ApiError(429, "結帳嘗試過於頻繁，請稍後再試");
  const input = CheckoutInput.parse(await req.json());
  if (input.delivery === "HOME" && !input.customer.address) throw new ApiError(400, "宅配訂單請填寫配送地址");
  const { tenant, access } = await getCommerceTenant(params.tenant);
  if (!access.allowed) throw new ApiError(403, access.reason || "此商城目前暫停接單");

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`web-checkout:${tenant.id}`}))`;

    const duplicate = await tx.salesOrder.findFirst({
      where: { tenantId: tenant.id, remark: { contains: `request=${input.requestId}` } },
      select: { number: true, total: true, status: true, createdAt: true },
    });
    if (duplicate) {
      return {
        id: duplicate.number,
        createdAt: duplicate.createdAt.toISOString(),
        status: duplicate.status === "SUBMITTED" ? "已送入 ERP・待處理" : duplicate.status,
        total: Number(duplicate.total),
        items: input.items.reduce((sum, item) => sum + item.quantity, 0),
        recipient: input.customer.name,
      };
    }

    const ids = [...new Set(input.items.map((item) => item.productId))];
    const [products, pendingLines] = await Promise.all([
      tx.product.findMany({
        where: { tenantId: tenant.id, id: { in: ids }, isActive: true },
        select: {
          id: true,
          sku: true,
          name: true,
          salePrice: true,
          stocks: { select: { quantity: true } },
        },
      }),
      tx.salesOrderItem.findMany({
        where: {
          productId: { in: ids },
          order: {
            tenantId: tenant.id,
            status: { in: ["SUBMITTED", "APPROVED", "PARTIALLY_SHIPPED"] },
            remark: { startsWith: "[WEB]" },
          },
        },
        select: { productId: true, quantity: true, shippedQty: true },
      }),
    ]);
    if (products.length !== ids.length) throw new ApiError(400, "購物車包含已下架或不屬於此商店的商品");

    const productById = new Map(products.map((product) => [product.id, product]));
    const reserved = reservedByProduct(pendingLines);
    const requested = new Map<string, number>();
    for (const item of input.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
    for (const product of products) {
      const physical = product.stocks.reduce((sum, row) => sum + Number(row.quantity), 0);
      const available = Math.max(0, physical - (reserved.get(product.id) ?? 0));
      if ((requested.get(product.id) ?? 0) > available) throw new ApiError(409, `${product.name} 可售庫存僅剩 ${available} 件`);
    }
    const computed = input.items.map((item) => {
      const product = productById.get(item.productId)!;
      const unitPrice = Number(product.salePrice);
      return { ...item, product, unitPrice, subtotal: unitPrice * item.quantity };
    });

    const merchandiseTotal = computed.reduce((sum, item) => sum + item.subtotal, 0);
    const shipping = input.delivery === "HOME" && merchandiseTotal < 2000 ? 120 : 0;
    const total = merchandiseTotal + shipping;
    const email = input.customer.email.toLowerCase();
    let customer = await tx.customer.findFirst({
      where: { tenantId: tenant.id, email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
    if (customer) {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          companyName: input.customer.name,
          contactName: input.customer.name,
          phone: input.customer.phone,
          email,
          address: input.customer.address || customer.address,
          isActive: true,
        },
      });
    } else {
      const customerCode = await nextNumberInTransaction(tx, "WEB-C", tenant.id);
      customer = await tx.customer.create({
        data: {
          tenantId: tenant.id,
          code: customerCode,
          companyName: input.customer.name,
          contactName: input.customer.name,
          phone: input.customer.phone,
          email,
          address: input.customer.address || null,
          remark: "由品牌官網結帳自動建立",
        },
      });
    }

    const orderNumber = await nextNumberInTransaction(tx, "EC", tenant.id);
    const paymentLabel = input.payment === "TRANSFER" ? "銀行轉帳待確認" : input.payment === "MOBILE" ? "行動支付待金流確認" : "信用卡待金流確認";
    const deliveryLabel = input.delivery === "PICKUP" ? "門市取貨" : "宅配到府";
    const order = await tx.salesOrder.create({
      data: {
        tenantId: tenant.id,
        number: orderNumber,
        customerId: customer.id,
        status: "SUBMITTED",
        subtotal: merchandiseTotal,
        discount: 0,
        taxAmount: 0,
        total,
        isTaxable: false,
        remark: `[WEB] request=${input.requestId}; ${paymentLabel}; ${deliveryLabel}; 運費=${shipping}; 地址=${input.customer.address || "門市取貨"}; 規格=${computed.map((item) => `${item.product.sku}:${item.color || "-"}:${item.size || "-"}x${item.quantity}`).join(",")}`,
        items: {
          create: computed.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: 0,
            taxRate: 0,
            subtotal: item.subtotal,
          })),
        },
      },
      select: { number: true, createdAt: true, total: true },
    });

    return {
      id: order.number,
      createdAt: order.createdAt.toISOString(),
      status: input.payment === "TRANSFER" ? "等待付款・已進 ERP" : "金流待確認・已進 ERP",
      total: Number(order.total),
      items: input.items.reduce((sum, item) => sum + item.quantity, 0),
      recipient: input.customer.name,
    };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

  return NextResponse.json({ order: result, erpStatus: "SUBMITTED", inventory: "RESERVED" }, { status: 201 });
});
