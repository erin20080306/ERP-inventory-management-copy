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
    updatedAt: z.string().datetime(),
    id: z.string().min(1).max(100),
  }).nullable().optional(),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (rate.count >= 30) return NextResponse.json({ error: "商城會員同步過於頻繁" }, { status: 429 });
  else rate.count += 1;

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "商城會員同步資料格式錯誤" }, { status: 400 });

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
    const cursorTime = cursor ? new Date(cursor.updatedAt) : null;
    const rows = await prisma.customer.findMany({
      where: {
        tenantId: tenant.id,
        AND: [
          {
            OR: [
              { storefrontMember: { isNot: null } },
              { remark: { startsWith: "官網會員已依本人要求刪除" } },
            ],
          },
          ...(cursor && cursorTime ? [{
            OR: [
              { updatedAt: { gt: cursorTime } },
              { updatedAt: cursorTime, id: { gt: cursor.id } },
            ],
          }] : []),
        ],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        companyName: true,
        contactName: true,
        phone: true,
        email: true,
        address: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        storefrontMember: {
          select: { isActive: true },
        },
      },
    });
    const last = rows.at(-1);
    const companyCode = tenant.companyCode || await ensureTenantCompanyCode(tenant.id);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
    const payload = {
      type: "ERIN_ERP_STOREFRONT_MEMBERS_V1",
      tenantId: tenant.id,
      companyCode,
      deviceFingerprint: fingerprintDeviceId(parsed.data.deviceId),
      licenseVersion: tenant.licenseVersion,
      members: rows.map((customer) => ({
        id: customer.id,
        name: customer.companyName,
        contactName: customer.contactName,
        phone: customer.phone,
        email: customer.email?.trim().toLowerCase() ?? null,
        address: customer.address,
        isActive: customer.isActive && Boolean(customer.storefrontMember?.isActive),
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      })),
      nextCursor: last ? { updatedAt: last.updatedAt.toISOString(), id: last.id } : cursor ?? null,
      hasMore: rows.length === 100,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    return NextResponse.json({ ok: true, members: signOfflineLease(payload) }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("storefront member sync error", error);
    return NextResponse.json({ error: "商城會員同步暫時無法使用" }, { status: 503 });
  }
}
