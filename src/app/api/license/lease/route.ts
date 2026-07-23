import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ONLINE_REFRESH_MINUTES, appendLicenseEvent, computeLicenseAccess, hashActivationKey,
  clampOfflineLeaseExpiry, fingerprintDeviceId, hashDeviceId, normalizeLicenseAccountUsername,
  signOfflineLease, workstationDeviceIdFromPublicKey,
} from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode } from "@/lib/product-editions";

const Input = z.object({
  activationKey: z.string().trim().min(24).max(200),
  deviceId: z.string().trim().min(8).max(300),
  deviceRole: z.enum(["SERVER", "WORKSTATION"]).default("SERVER"),
  devicePublicKey: z.string().trim().max(1000).optional(),
  displayName: z.string().trim().max(100).optional(),
  platform: z.enum(["windows", "macos", "linux"]).optional(),
  appVersion: z.string().trim().max(40).optional(),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (rate.count >= 30) return NextResponse.json({ error: "驗證過於頻繁" }, { status: 429 });
  else rate.count += 1;

  const parsed = Input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "啟用資料格式錯誤" }, { status: 400 });

  try {
    if (parsed.data.deviceRole === "WORKSTATION") {
      if (!parsed.data.devicePublicKey) return NextResponse.json({ error: "工作站缺少裝置公鑰" }, { status: 400 });
      try {
        if (workstationDeviceIdFromPublicKey(parsed.data.devicePublicKey) !== parsed.data.deviceId) {
          return NextResponse.json({ error: "工作站裝置 ID 與公鑰不一致" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "工作站裝置公鑰無效" }, { status: 400 });
      }
    }
    const keyHash = hashActivationKey(parsed.data.activationKey);
    const tenant = await prisma.tenant.findUnique({
      where: { licenseKeyHash: keyHash },
      select: {
        id: true, name: true, businessMode: true, createdAt: true,
        licensePlan: true, licenseBilling: true, licenseStatus: true, licenseSeatLimit: true,
        licenseActivatedAt: true, licenseExpiresAt: true, licenseKeyHash: true, licenseVersion: true,
      },
    });
    if (!tenant) return NextResponse.json({ error: "啟用碼無效" }, { status: 401 });

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
    if (!access.allowed) return NextResponse.json({ error: access.reason || "授權不可用", access }, { status: 402 });

    const deviceHash = hashDeviceId(parsed.data.deviceId);
    const binding = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenant.id}))`;
      const current = await tx.licenseDevice.findUnique({ where: { tenantId_deviceHash: { tenantId: tenant.id, deviceHash } } });
      if (current?.revokedAt) throw new Error("DEVICE_REVOKED");
      if (current && current.deviceRole !== parsed.data.deviceRole) throw new Error("DEVICE_ID_CONFLICT");
      if (current?.devicePublicKey && current.devicePublicKey !== parsed.data.devicePublicKey) throw new Error("DEVICE_ID_CONFLICT");
      let replacedDeviceIds: string[] = [];
      if (!current) {
        const seatLimit = parsed.data.deviceRole === "SERVER" ? 1 : Math.max(1, tenant.licenseSeatLimit);
        const activeDevices = await tx.licenseDevice.findMany({
          where: { tenantId: tenant.id, deviceRole: parsed.data.deviceRole, revokedAt: null },
          orderBy: [{ lastSeenAt: "asc" }, { firstSeenAt: "asc" }],
          select: { id: true },
        });
        const replacementCount = Math.max(0, activeDevices.length - seatLimit + 1);
        replacedDeviceIds = activeDevices.slice(0, replacementCount).map((item) => item.id);
        if (replacedDeviceIds.length > 0) {
          await tx.licenseDevice.updateMany({
            where: { tenantId: tenant.id, id: { in: replacedDeviceIds }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
      const device = await tx.licenseDevice.upsert({
        where: { tenantId_deviceHash: { tenantId: tenant.id, deviceHash } },
        update: { lastSeenAt: new Date(), lastIp: ip, displayName: parsed.data.displayName, platform: parsed.data.platform, appVersion: parsed.data.appVersion },
        create: { tenantId: tenant.id, deviceHash, deviceRole: parsed.data.deviceRole, devicePublicKey: parsed.data.devicePublicKey, lastIp: ip, displayName: parsed.data.displayName, platform: parsed.data.platform, appVersion: parsed.data.appVersion },
      });
      return { device, replacedDeviceIds };
    }, { isolationLevel: "ReadCommitted" });

    const { device, replacedDeviceIds } = binding;

    if (device.firstSeenAt.getTime() === device.lastSeenAt.getTime()) {
      await appendLicenseEvent({ tenantId: tenant.id, action: "DEVICE_BOUND", payload: { deviceId: device.id, deviceRole: device.deviceRole, displayName: device.displayName, platform: device.platform } });
    }
    if (replacedDeviceIds.length > 0) {
      await appendLicenseEvent({
        tenantId: tenant.id,
        action: "DEVICE_AUTO_REPLACED",
        payload: { deviceId: device.id, deviceRole: device.deviceRole, replacedDeviceIds },
      });
    }

    const primaryAccountRecord = parsed.data.deviceRole === "SERVER"
      ? await prisma.user.findFirst({
          where: { tenantId: tenant.id, isActive: true, userRoles: { some: { role: { name: "系統管理員" } } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { username: true, email: true, name: true, passwordHash: true },
        }) ?? await prisma.user.findFirst({
          where: { tenantId: tenant.id, isActive: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { username: true, email: true, name: true, passwordHash: true },
        })
      : null;
    const primaryAccount = primaryAccountRecord
      ? {
          ...primaryAccountRecord,
          username: normalizeLicenseAccountUsername(primaryAccountRecord.username, primaryAccountRecord.email),
        }
      : null;
    const issuedAt = new Date();
    const expiresAt = clampOfflineLeaseExpiry(issuedAt, access.expiresAt);
    const lease = signOfflineLease({
      tenantId: tenant.id,
      tenantName: tenant.name,
      businessMode: normalizeBusinessMode(tenant.businessMode),
      deviceId: device.id,
      deviceRole: device.deviceRole,
      devicePublicKey: device.devicePublicKey,
      deviceFingerprint: fingerprintDeviceId(parsed.data.deviceId),
      planCode: tenant.licensePlan,
      paymentType: access.paymentType,
      subscriptionExpiresAt: access.expiresAt,
      seatLimit: tenant.licenseSeatLimit,
      licenseVersion: tenant.licenseVersion,
      ...(parsed.data.deviceRole === "SERVER" ? { primaryAccount } : {}),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return NextResponse.json({ ok: true, lease, access, nextCheckInSeconds: ONLINE_REFRESH_MINUTES * 60 });
  } catch (error) {
    if (error instanceof Error && error.message === "DEVICE_REVOKED") return NextResponse.json({ error: "此電腦已由管理者撤銷" }, { status: 403 });
    if (error instanceof Error && error.message === "DEVICE_ID_CONFLICT") return NextResponse.json({ error: "裝置身分與既有紀錄衝突" }, { status: 409 });
    console.error("license lease error", error);
    return NextResponse.json({ error: "授權伺服器暫時無法驗證" }, { status: 503 });
  }
}
