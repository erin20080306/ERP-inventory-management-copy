import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  computeLicenseAccess,
  hashActivationKey,
  hashDeviceId,
} from "@/lib/license";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SyncedStatus = z.enum([
  "SUBMITTED",
  "APPROVED",
  "PARTIALLY_SHIPPED",
  "POSTED",
  "REJECTED",
  "VOIDED",
]);

const Input = z.object({
  activationKey: z.string().trim().min(24).max(200),
  deviceId: z.string().trim().min(8).max(300),
  updates: z.array(z.object({
    orderId: z.string().min(1).max(100),
    status: SyncedStatus,
    shipmentNumber: z.string().trim().min(1).max(100).nullable().optional(),
    shippedAt: z.string().datetime().nullable().optional(),
  })).min(1).max(50),
});

const attempts = new Map<string, { count: number; resetAt: number }>();
const HOST_FULFILLMENT_MARKER = /\s*\[HOST-FULFILLMENT:[A-Za-z0-9_-]+\]/g;

function transitionAllowed(current: string, next: z.infer<typeof SyncedStatus>) {
  if (current === next) return true;
  if (current === "POSTED" || current === "VOIDED") return false;
  if (next === "VOIDED") return ["SUBMITTED", "APPROVED", "REJECTED"].includes(current);
  if (next === "REJECTED") return current === "SUBMITTED";
  if (next === "SUBMITTED") return current === "REJECTED";
  if (next === "APPROVED") return ["SUBMITTED", "REJECTED"].includes(current);
  if (next === "PARTIALLY_SHIPPED") return ["APPROVED", "PARTIALLY_SHIPPED"].includes(current);
  if (next === "POSTED") return ["APPROVED", "PARTIALLY_SHIPPED"].includes(current);
  return false;
}

function fulfillmentRemark(
  remark: string | null,
  update: z.infer<typeof Input>["updates"][number],
) {
  const clean = (remark || "").replace(HOST_FULFILLMENT_MARKER, "").trim();
  const metadata = Buffer.from(JSON.stringify({
    status: update.status,
    shipmentNumber: update.shipmentNumber ?? null,
    shippedAt: update.shippedAt ?? null,
  }), "utf8").toString("base64url");
  return `${clean} [HOST-FULFILLMENT:${metadata}]`.trim();
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (rate.count >= 60) return NextResponse.json({ error: "商城狀態同步過於頻繁" }, { status: 429 });
  else rate.count += 1;

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "商城狀態同步資料格式錯誤" }, { status: 400 });

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { licenseKeyHash: hashActivationKey(parsed.data.activationKey) },
      select: {
        id: true,
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

    const updateById = new Map(parsed.data.updates.map((update) => [update.orderId, update]));
    const orders = await prisma.salesOrder.findMany({
      where: {
        tenantId: tenant.id,
        id: { in: [...updateById.keys()] },
        remark: { startsWith: "[WEB]" },
      },
      select: { id: true, status: true, remark: true },
    });

    let synced = 0;
    let ignored = 0;
    await prisma.$transaction(async (tx) => {
      for (const order of orders) {
        const update = updateById.get(order.id);
        if (!update || !transitionAllowed(order.status, update.status)) {
          ignored += 1;
          continue;
        }
        const shippedAt = update.shippedAt ? new Date(update.shippedAt) : undefined;
        await tx.salesOrder.update({
          where: { id: order.id },
          data: {
            status: update.status,
            ...(shippedAt ? { shippedAt } : {}),
            remark: fulfillmentRemark(order.remark, update),
            updatedBy: "INSTALLED_HOST_SYNC",
          },
        });
        synced += 1;
      }
    });

    ignored += parsed.data.updates.length - orders.length;
    return NextResponse.json({ ok: true, synced, ignored }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("storefront order status sync error", error);
    return NextResponse.json({ error: "商城狀態同步暫時無法使用" }, { status: 503 });
  }
}
