import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appendLicenseEvent,
  hashActivationKey,
  hashDeviceId,
  invalidateLicenseAccessCache,
} from "@/lib/license";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Input = z.object({
  activationKey: z.string().trim().min(24).max(200),
  deviceId: z.string().trim().min(8).max(300),
  companyName: z.string().trim().min(1).max(200),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (rate.count >= 20) return NextResponse.json({ error: "公司資料更新過於頻繁" }, { status: 429 });
  else rate.count += 1;

  const parsed = Input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "公司資料格式錯誤" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { licenseKeyHash: hashActivationKey(parsed.data.activationKey) },
    select: { id: true, name: true, licenseStatus: true, licenseVersion: true },
  });
  if (!tenant) return NextResponse.json({ error: "啟用碼無效" }, { status: 401 });
  if (tenant.licenseStatus !== "ACTIVE") {
    return NextResponse.json({ error: "公司授權未啟用，無法變更公司資料" }, { status: 402 });
  }

  const server = await prisma.licenseDevice.findUnique({
    where: {
      tenantId_deviceHash: {
        tenantId: tenant.id,
        deviceHash: hashDeviceId(parsed.data.deviceId),
      },
    },
    select: { id: true, deviceRole: true, revokedAt: true },
  });
  if (!server || server.deviceRole !== "SERVER" || server.revokedAt) {
    return NextResponse.json({ error: "只有目前已授權的公司主機可以變更公司資料" }, { status: 403 });
  }

  if (tenant.name === parsed.data.companyName) {
    return NextResponse.json({ ok: true, companyName: tenant.name, licenseVersion: tenant.licenseVersion });
  }

  const changedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        name: parsed.data.companyName,
        licenseVersion: { increment: 1 },
        licenseUpdatedAt: changedAt,
      },
      select: { name: true, licenseVersion: true },
    });
    await tx.companySetting.updateMany({
      where: { tenantId: tenant.id },
      data: { name: parsed.data.companyName },
    });
    return saved;
  });

  await appendLicenseEvent({
    tenantId: tenant.id,
    action: "COMPANY_NAME_CHANGED",
    payload: {
      previousName: tenant.name,
      companyName: updated.name,
      serverDeviceId: server.id,
      licenseVersion: updated.licenseVersion,
      changedAt: changedAt.toISOString(),
    },
  });
  invalidateLicenseAccessCache(tenant.id);
  return NextResponse.json({ ok: true, companyName: updated.name, licenseVersion: updated.licenseVersion });
}
