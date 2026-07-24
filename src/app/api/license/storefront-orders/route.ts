import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  computeLicenseAccess,
  ensureTenantCompanyCode,
  fingerprintDeviceId,
  hashActivationKey,
  hashDeviceId,
  signOfflineLease,
} from "@/lib/license";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Input = z.object({
  activationKey: z.string().trim().min(24).max(200),
  deviceId: z.string().trim().min(8).max(300),
  cursor: z.object({
    createdAt: z.string().datetime(),
    id: z.string().min(1).max(100),
  }).nullable().optional(),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (rate.count >= 30) return NextResponse.json({ error: "商城訂單同步過於頻繁" }, { status: 429 });
  else rate.count += 1;

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "商城訂單同步資料格式錯誤" }, { status: 400 });

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { licenseKeyHash: hashActivationKey(parsed.data.activationKey) },
      select: {
        id: true,
        companyCode: true,
        businessMode: true,
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
    if (!tenant) return NextResponse.json({ error: "啟用碼無效" }, { status: 401 });
    if (tenant.businessMode !== "ECOMMERCE") {
      return NextResponse.json({ error: "此租戶不是電商租戶" }, { status: 403 });
    }
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
    if (!access.allowed) return NextResponse.json({ error: access.reason || "授權不可用" }, { status: 402 });

    const device = await prisma.licenseDevice.findUnique({
      where: {
        tenantId_deviceHash: {
          tenantId: tenant.id,
          deviceHash: hashDeviceId(parsed.data.deviceId),
        },
      },
      select: { deviceRole: true, revokedAt: true },
    });
    if (!device || device.deviceRole !== "SERVER" || device.revokedAt) {
      return NextResponse.json({ error: "這台電腦沒有此租戶的公司主機授權" }, { status: 403 });
    }

    const cursor = parsed.data.cursor;
    const cursorTime = cursor ? new Date(cursor.createdAt) : null;
    const rows = await prisma.salesOrder.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["SUBMITTED", "APPROVED", "PARTIALLY_SHIPPED"] },
        remark: { startsWith: "[WEB]" },
        ...(cursor && cursorTime ? {
          OR: [
            { createdAt: { gt: cursorTime } },
            { createdAt: cursorTime, id: { gt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        number: true,
        status: true,
        orderDate: true,
        createdAt: true,
        subtotal: true,
        discount: true,
        taxAmount: true,
        total: true,
        isTaxable: true,
        remark: true,
        warehouseId: true,
        customer: {
          select: {
            companyName: true,
            contactName: true,
            phone: true,
            email: true,
            address: true,
          },
        },
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            taxRate: true,
            subtotal: true,
            product: { select: { sku: true, name: true, spec: true } },
          },
        },
        storefrontPayment: {
          select: {
            method: true,
            status: true,
            amount: true,
            refundedAmount: true,
            provider: true,
            providerReference: true,
            expiresAt: true,
            paidAt: true,
          },
        },
      },
    });
    const warehouseIds = [...new Set(rows.flatMap((order) => order.warehouseId ? [order.warehouseId] : []))];
    const warehouses = warehouseIds.length
      ? await prisma.warehouse.findMany({
          where: { tenantId: tenant.id, id: { in: warehouseIds } },
          select: { id: true, code: true },
        })
      : [];
    const warehouseCodeById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.code]));
    const last = rows.at(-1);
    const companyCode = tenant.companyCode || await ensureTenantCompanyCode(tenant.id);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
    const payload = {
      type: "ERIN_ERP_STOREFRONT_ORDERS_V1",
      tenantId: tenant.id,
      companyCode,
      deviceFingerprint: fingerprintDeviceId(parsed.data.deviceId),
      licenseVersion: tenant.licenseVersion,
      orders: rows.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        orderDate: order.orderDate.toISOString(),
        createdAt: order.createdAt.toISOString(),
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        taxAmount: Number(order.taxAmount),
        total: Number(order.total),
        isTaxable: order.isTaxable,
        remark: order.remark,
        warehouseCode: order.warehouseId ? warehouseCodeById.get(order.warehouseId) ?? null : null,
        customer: {
          companyName: order.customer.companyName,
          contactName: order.customer.contactName,
          phone: order.customer.phone,
          email: order.customer.email || `web-order-${order.id}@invalid.local`,
          address: order.customer.address,
        },
        items: order.items.map((item) => ({
          id: item.id,
          sku: item.product.sku,
          name: item.product.name,
          spec: item.product.spec,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
          taxRate: Number(item.taxRate),
          subtotal: Number(item.subtotal),
        })),
        payment: order.storefrontPayment ? {
          method: order.storefrontPayment.method,
          status: order.storefrontPayment.status,
          amount: Number(order.storefrontPayment.amount),
          refundedAmount: Number(order.storefrontPayment.refundedAmount),
          provider: order.storefrontPayment.provider,
          providerReference: order.storefrontPayment.providerReference,
          expiresAt: order.storefrontPayment.expiresAt?.toISOString() ?? null,
          paidAt: order.storefrontPayment.paidAt?.toISOString() ?? null,
        } : null,
      })),
      nextCursor: last ? { createdAt: last.createdAt.toISOString(), id: last.id } : cursor ?? null,
      hasMore: rows.length === 100,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    return NextResponse.json({ ok: true, orders: signOfflineLease(payload) }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("storefront order sync error", error);
    return NextResponse.json({ error: "商城訂單同步暫時無法使用" }, { status: 503 });
  }
}
