import { z } from "zod";
import { nextNumberFastInTransaction } from "./number-sequence";
import { prisma } from "./prisma";
import { fingerprintDeviceId, verifyOfflineLease, type SignedOfflineLease } from "./license";

const PAYMENT_METHODS = ["CARD", "MOBILE", "TRANSFER"] as const;
const PAYMENT_STATUSES = [
  "AWAITING_TRANSFER",
  "GATEWAY_REQUIRED",
  "PENDING",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;
const SYNCED_ORDER_STATUSES = [
  "SUBMITTED",
  "APPROVED",
  "PARTIALLY_SHIPPED",
  "POSTED",
  "REJECTED",
  "VOIDED",
] as const;

const CursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().min(1).max(100),
});

const CentralOrderSchema = z.object({
  id: z.string().min(1).max(100),
  number: z.string().min(1).max(100),
  status: z.enum(["SUBMITTED", "APPROVED", "PARTIALLY_SHIPPED"]),
  orderDate: z.string().datetime(),
  createdAt: z.string().datetime(),
  subtotal: z.number().finite(),
  discount: z.number().finite(),
  taxAmount: z.number().finite(),
  total: z.number().finite(),
  isTaxable: z.boolean(),
  remark: z.string().nullable(),
  warehouseCode: z.string().max(100).nullable(),
  customer: z.object({
    companyName: z.string().min(1).max(200),
    contactName: z.string().max(200).nullable(),
    phone: z.string().max(100).nullable(),
    email: z.string().email().max(200),
    address: z.string().max(500).nullable(),
  }),
  items: z.array(z.object({
    id: z.string().min(1).max(100),
    sku: z.string().min(1).max(100),
    name: z.string().min(1).max(300),
    spec: z.string().max(300).nullable(),
    quantity: z.number().positive().finite(),
    unitPrice: z.number().nonnegative().finite(),
    discount: z.number().nonnegative().finite(),
    taxRate: z.number().nonnegative().finite(),
    subtotal: z.number().finite(),
  })).min(1).max(200),
  payment: z.object({
    method: z.enum(PAYMENT_METHODS),
    status: z.enum(PAYMENT_STATUSES),
    amount: z.number().nonnegative().finite(),
    refundedAmount: z.number().nonnegative().finite(),
    provider: z.string().max(100).nullable(),
    providerReference: z.string().max(300).nullable(),
    expiresAt: z.string().datetime().nullable(),
    paidAt: z.string().datetime().nullable(),
  }).nullable(),
});

const PayloadSchema = z.object({
  type: z.literal("ERIN_ERP_STOREFRONT_ORDERS_V1"),
  tenantId: z.string().min(1).max(100),
  companyCode: z.string().min(8).max(40),
  deviceFingerprint: z.string().min(20).max(100),
  licenseVersion: z.number().int().nonnegative(),
  orders: z.array(CentralOrderSchema).max(100),
  nextCursor: CursorSchema.nullable(),
  hasMore: z.boolean(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const PendingStatusSchema = z.object({
  orderId: z.string().min(1).max(100),
  queuedAt: z.string().datetime(),
});

export type CentralStorefrontOrder = z.infer<typeof CentralOrderSchema>;
export type StorefrontOrderSyncCursor = z.infer<typeof CursorSchema>;
export type StorefrontOrderSyncPayload = z.infer<typeof PayloadSchema>;
export type StorefrontOrderStatusSyncResult = {
  synced: boolean;
  queued: boolean;
  skipped?: boolean;
  error?: string;
};

const syncTasks = new Map<string, Promise<{ imported: number; pages: number }>>();
const statusSyncTasks = new Map<string, Promise<StorefrontOrderStatusSyncResult>>();

function checkpointKey(tenantId: string) {
  return `storefront-order-sync:${tenantId}`;
}

function pendingStatusPrefix(tenantId: string) {
  return `storefront-order-status-pending:${tenantId}:`;
}

function pendingStatusKey(tenantId: string, orderId: string) {
  return `${pendingStatusPrefix(tenantId)}${orderId}`;
}

function sourceMarker(orderId: string) {
  return `[CENTRAL-WEB:${orderId}]`;
}

function readSourceOrderId(remark: string | null) {
  return remark?.match(/\[CENTRAL-WEB:([^\]]+)\]/)?.[1] ?? null;
}

async function readCheckpoint(tenantId: string) {
  const row = await prisma.systemSetting.findUnique({ where: { key: checkpointKey(tenantId) } });
  if (!row) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseSignedPayload(lease: SignedOfflineLease, expectedTenantId: string, deviceId: string) {
  if (!verifyOfflineLease(lease)) throw new Error("中央商城訂單簽章無效");
  const parsed = PayloadSchema.safeParse(lease.payload);
  if (!parsed.success) throw new Error("中央商城訂單格式無效");
  const payload = parsed.data;
  if (payload.tenantId !== expectedTenantId) throw new Error("中央商城訂單不屬於此租戶");
  if (payload.deviceFingerprint !== fingerprintDeviceId(deviceId)) throw new Error("中央商城訂單不屬於此公司主機");
  const now = Date.now();
  const issuedAt = new Date(payload.issuedAt).getTime();
  const expiresAt = new Date(payload.expiresAt).getTime();
  if (now < issuedAt - 5 * 60_000 || now >= expiresAt) throw new Error("中央商城訂單同步憑證已過期");
  return payload;
}

async function localSyncConfig(tenantId: string) {
  if (process.env.LOCAL_LICENSE_MODE !== "true") return null;
  const activationKey = process.env.LOCAL_ACTIVATION_KEY?.trim();
  const deviceId = process.env.LOCAL_DEVICE_ID?.trim();
  const baseUrl = process.env.CENTRAL_LICENSE_URL?.replace(/\/$/, "");
  if (!activationKey || !deviceId || !baseUrl) throw new Error("公司 Host 缺少中央商城訂單同步設定");

  const [tenant, localLease] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessMode: true } }),
    prisma.offlineLicenseLease.findUnique({ where: { tenantId }, select: { remoteTenantId: true } }),
  ]);
  if (tenant?.businessMode !== "ECOMMERCE") return null;
  if (!localLease?.remoteTenantId) throw new Error("公司 Host 尚未取得中央租戶識別");
  return { activationKey, deviceId, baseUrl, remoteTenantId: localLease.remoteTenantId };
}

export async function importCentralStorefrontOrders(
  tenantId: string,
  payload: StorefrontOrderSyncPayload,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`storefront-order-sync:${tenantId}`}))`;
    const allSkus = [...new Set(payload.orders.flatMap((order) => order.items.map((item) => item.sku)))];
    const products = allSkus.length
      ? await tx.product.findMany({
          where: { tenantId, sku: { in: allSkus }, isArchived: false },
          select: { id: true, sku: true },
        })
      : [];
    const productBySku = new Map(products.map((product) => [product.sku, product.id]));
    const missingSkus = allSkus.filter((sku) => !productBySku.has(sku));
    if (missingSkus.length) {
      throw new Error(`公司 Host 缺少商城商品 SKU：${missingSkus.join("、")}`);
    }

    const warehouseCodes = [...new Set([
      "WH01",
      ...payload.orders.flatMap((order) => order.warehouseCode ? [order.warehouseCode] : []),
    ])];
    const warehouses = await tx.warehouse.findMany({
      where: { tenantId, code: { in: warehouseCodes }, isActive: true },
      select: { id: true, code: true },
    });
    const warehouseByCode = new Map(warehouses.map((warehouse) => [warehouse.code, warehouse.id]));
    const defaultWarehouseId = warehouseByCode.get("WH01") ?? warehouses[0]?.id ?? null;

    let imported = 0;
    for (const source of payload.orders) {
      const marker = sourceMarker(source.id);
      const duplicate = await tx.salesOrder.findFirst({
        where: { tenantId, remark: { contains: marker } },
        select: { id: true },
      });
      if (duplicate) continue;

      const email = source.customer.email.trim().toLowerCase();
      let customer = await tx.customer.findFirst({
        where: { tenantId, email: { equals: email, mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (customer) {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            companyName: source.customer.companyName,
            contactName: source.customer.contactName || source.customer.companyName,
            phone: source.customer.phone,
            email,
            address: source.customer.address,
            isActive: true,
          },
        });
      } else {
        const code = await nextNumberFastInTransaction(tx, "WEB-C", tenantId);
        customer = await tx.customer.create({
          data: {
            tenantId,
            code,
            companyName: source.customer.companyName,
            contactName: source.customer.contactName || source.customer.companyName,
            phone: source.customer.phone,
            email,
            address: source.customer.address,
            remark: "由中央專屬商城訂單同步建立",
          },
          select: { id: true },
        });
      }

      const numberConflict = await tx.salesOrder.findUnique({
        where: { tenantId_number: { tenantId, number: source.number } },
        select: { id: true },
      });
      const number = numberConflict ? `CLOUD-${source.number}-${source.id.slice(-8)}` : source.number;
      await tx.salesOrder.create({
        data: {
          tenantId,
          number,
          customerId: customer.id,
          warehouseId: source.warehouseCode
            ? warehouseByCode.get(source.warehouseCode) ?? defaultWarehouseId
            : defaultWarehouseId,
          orderDate: new Date(source.orderDate),
          createdAt: new Date(source.createdAt),
          status: "SUBMITTED",
          subtotal: source.subtotal,
          discount: source.discount,
          taxAmount: source.taxAmount,
          total: source.total,
          isTaxable: source.isTaxable,
          updatedBy: "CENTRAL_STOREFRONT_SYNC",
          remark: `[WEB] ${marker} centralNo=${source.number}; centralStatus=${source.status}; ${source.remark || ""}`.trim(),
          items: {
            create: source.items.map((item) => ({
              productId: productBySku.get(item.sku)!,
              quantity: item.quantity,
              shippedQty: 0,
              unitPrice: item.unitPrice,
              discount: item.discount,
              taxRate: item.taxRate,
              subtotal: item.subtotal,
            })),
          },
          ...(source.payment ? {
            storefrontPayment: {
              create: {
                tenantId,
                method: source.payment.method,
                status: source.payment.status,
                amount: source.payment.amount,
                refundedAmount: source.payment.refundedAmount,
                provider: source.payment.provider,
                providerReference: source.payment.providerReference,
                expiresAt: source.payment.expiresAt ? new Date(source.payment.expiresAt) : null,
                paidAt: source.payment.paidAt ? new Date(source.payment.paidAt) : null,
              },
            },
          } : {}),
        },
      });
      imported += 1;
    }

    if (payload.nextCursor) {
      await tx.systemSetting.upsert({
        where: { key: checkpointKey(tenantId) },
        update: { value: JSON.stringify(payload.nextCursor) },
        create: { key: checkpointKey(tenantId), value: JSON.stringify(payload.nextCursor) },
      });
    }
    return imported;
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}

async function pushLocalStatus(
  tenantId: string,
  orderId: string,
  queueOnFailure: boolean,
): Promise<StorefrontOrderStatusSyncResult> {
  const config = await localSyncConfig(tenantId);
  if (!config) return { synced: false, queued: false, skipped: true };

  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId, tenantId },
    select: {
      status: true,
      remark: true,
      shippedAt: true,
      shipments: {
        where: { status: "POSTED" },
        orderBy: { shipmentDate: "desc" },
        take: 1,
        select: { number: true, shipmentDate: true },
      },
    },
  });
  const sourceOrderId = readSourceOrderId(order?.remark ?? null);
  const parsedStatus = z.enum(SYNCED_ORDER_STATUSES).safeParse(order?.status);
  if (!order || !sourceOrderId || !parsedStatus.success) {
    return { synced: false, queued: false, skipped: true };
  }

  const latestShipment = order.shipments[0];
  const update = {
    orderId: sourceOrderId,
    status: parsedStatus.data,
    shipmentNumber: latestShipment?.number ?? null,
    shippedAt: (latestShipment?.shipmentDate ?? order.shippedAt)?.toISOString() ?? null,
  };

  try {
    const response = await fetch(`${config.baseUrl}/api/license/storefront-order-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activationKey: config.activationKey,
        deviceId: config.deviceId,
        updates: [update],
      }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "中央商城狀態同步失敗");
    await prisma.systemSetting.deleteMany({ where: { key: pendingStatusKey(tenantId, orderId) } });
    return { synced: true, queued: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "中央商城狀態同步失敗";
    if (queueOnFailure) {
      const pending = { orderId, queuedAt: new Date().toISOString() };
      await prisma.systemSetting.upsert({
        where: { key: pendingStatusKey(tenantId, orderId) },
        update: { value: JSON.stringify(pending) },
        create: { key: pendingStatusKey(tenantId, orderId), value: JSON.stringify(pending) },
      });
      return { synced: false, queued: true, error: message };
    }
    return { synced: false, queued: false, error: message };
  }
}

export async function syncLocalStorefrontOrderStatus(
  tenantId: string,
  orderId: string,
): Promise<StorefrontOrderStatusSyncResult> {
  const key = `${tenantId}:${orderId}`;
  const existing = statusSyncTasks.get(key);
  if (existing) return existing;
  const task = pushLocalStatus(tenantId, orderId, true).finally(() => statusSyncTasks.delete(key));
  statusSyncTasks.set(key, task);
  return task;
}

export async function flushPendingCentralStorefrontOrderStatuses(tenantId: string) {
  if (process.env.LOCAL_LICENSE_MODE !== "true") return { synced: 0, failed: 0 };
  const rows = await prisma.systemSetting.findMany({
    where: { key: { startsWith: pendingStatusPrefix(tenantId) } },
    orderBy: { key: "asc" },
    take: 50,
  });
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const parsed = PendingStatusSchema.safeParse(JSON.parse(row.value));
      if (!parsed.success) {
        await prisma.systemSetting.deleteMany({ where: { key: row.key } });
        continue;
      }
      const result = await pushLocalStatus(tenantId, parsed.data.orderId, false);
      if (result.synced || result.skipped) {
        await prisma.systemSetting.deleteMany({ where: { key: row.key } });
        if (result.synced) synced += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { synced, failed };
}

async function runSync(tenantId: string) {
  const config = await localSyncConfig(tenantId);
  if (!config) return { imported: 0, pages: 0 };

  await flushPendingCentralStorefrontOrderStatuses(tenantId);
  let cursor = await readCheckpoint(tenantId);
  let imported = 0;
  let pages = 0;
  for (; pages < 20; pages += 1) {
    const response = await fetch(`${config.baseUrl}/api/license/storefront-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activationKey: config.activationKey, deviceId: config.deviceId, cursor }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "中央商城訂單同步失敗");
    const signed = result?.orders as SignedOfflineLease | undefined;
    if (!signed) throw new Error("中央商城訂單同步回覆不完整");
    const payload = parseSignedPayload(signed, config.remoteTenantId, config.deviceId);
    imported += await importCentralStorefrontOrders(tenantId, payload);
    cursor = payload.nextCursor;
    if (!payload.hasMore) return { imported, pages: pages + 1 };
    if (!cursor) throw new Error("中央商城訂單分頁游標遺失");
  }
  throw new Error("中央商城訂單過多，請重新整理接單工作區繼續同步");
}

export async function syncCentralStorefrontOrders(tenantId: string) {
  const existing = syncTasks.get(tenantId);
  if (existing) return existing;
  const task = runSync(tenantId).finally(() => syncTasks.delete(tenantId));
  syncTasks.set(tenantId, task);
  return task;
}
