import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeDiscoveryServerUrl, validateDiscoveryCaCertificate } from "@/lib/company-discovery";
import {
  appendLicenseEvent,
  computeLicenseAccess,
  ensureTenantCompanyCode,
  hashActivationKey,
  hashDeviceId,
} from "@/lib/license";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Input = z.object({
  activationKey: z.string().trim().min(24).max(200),
  deviceId: z.string().trim().min(8).max(300),
  serverUrl: z.string().trim().min(1).max(500),
  caCertificateB64: z.string().trim().min(100).max(50_000),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

async function readInput(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return req.json();
  const form = await req.formData();
  return Object.fromEntries(form.entries());
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (rate.count >= 10) return NextResponse.json({ error: "公司主機登錄過於頻繁" }, { status: 429 });
  else rate.count += 1;

  const parsed = Input.safeParse(await readInput(req).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "公司主機登錄資料格式錯誤" }, { status: 400 });

  try {
    const serverUrl = normalizeDiscoveryServerUrl(parsed.data.serverUrl);
    const caCertificate = validateDiscoveryCaCertificate(Buffer.from(parsed.data.caCertificateB64, "base64").toString("utf8"));
    const tenant = await prisma.tenant.findUnique({
      where: { licenseKeyHash: hashActivationKey(parsed.data.activationKey) },
      select: {
        id: true, createdAt: true, licensePlan: true, licenseBilling: true, licenseStatus: true,
        licenseSeatLimit: true, licenseActivatedAt: true, licenseExpiresAt: true, licenseKeyHash: true,
        licenseVersion: true,
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
    if (!access.allowed) return NextResponse.json({ error: access.reason || "授權不可用" }, { status: 402 });

    const device = await prisma.licenseDevice.findUnique({
      where: { tenantId_deviceHash: { tenantId: tenant.id, deviceHash: hashDeviceId(parsed.data.deviceId) } },
      select: { id: true, deviceRole: true, revokedAt: true },
    });
    if (!device || device.deviceRole !== "SERVER" || device.revokedAt) {
      return NextResponse.json({ error: "這台電腦尚未取得有效的公司主機授權" }, { status: 403 });
    }

    const companyCode = await ensureTenantCompanyCode(tenant.id);
    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        discoveryServerUrl: serverUrl,
        discoveryCaCertificate: caCertificate,
        discoveryEnabled: true,
        discoveryVersion: { increment: 1 },
        discoveryUpdatedAt: new Date(),
      },
      select: { discoveryVersion: true },
    });
    await appendLicenseEvent({
      tenantId: tenant.id,
      action: "COMPANY_SERVER_AUTO_REGISTERED",
      payload: { deviceId: device.id, companyCode, serverUrl, discoveryVersion: updated.discoveryVersion },
    });
    return NextResponse.json({ ok: true, companyCode, discoveryVersion: updated.discoveryVersion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "公司主機自動登錄失敗";
    const clientError = /網址|憑證/.test(message);
    if (!clientError) console.error("server discovery registration error", error);
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 503 });
  }
}
