import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  computeLicenseAccess,
  hashActivationKey,
  normalizeCompanyCode,
  signOfflineLease,
} from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode } from "@/lib/product-editions";

const Input = z.object({
  companyCode: z.string().trim().min(8).max(40).regex(/^[A-Za-z0-9-]+$/).optional(),
  activationKey: z.string().trim().min(24).max(200),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (rate.count >= 20) return NextResponse.json({ error: "公司連線查詢過於頻繁" }, { status: 429 });
  else rate.count += 1;

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "公司代碼或啟用碼格式錯誤" }, { status: 400 });

  try {
    const companyCode = parsed.data.companyCode
      ? normalizeCompanyCode(parsed.data.companyCode)
      : undefined;
    const tenant = await prisma.tenant.findFirst({
      where: {
        licenseKeyHash: hashActivationKey(parsed.data.activationKey),
        ...(companyCode ? { companyCode } : {}),
      },
      select: {
        id: true,
        name: true,
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
        discoveryEnabled: true,
        discoveryServerUrl: true,
        discoveryCaCertificate: true,
        discoveryVersion: true,
      },
    });
    if (!tenant) return NextResponse.json({ error: companyCode ? "公司代碼或啟用碼無效" : "啟用碼無效" }, { status: 401 });

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
    if (!access.allowed) return NextResponse.json({ error: access.reason || "公司授權不可用" }, { status: 402 });
    if (!tenant.discoveryEnabled || !tenant.discoveryServerUrl || !tenant.discoveryCaCertificate) {
      return NextResponse.json({ error: "此公司尚未完成自動連線設定，請聯絡艾琳設計" }, { status: 409 });
    }

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
    const caFingerprint = createHash("sha256").update(tenant.discoveryCaCertificate).digest("base64url");
    const discovery = signOfflineLease({
      type: "ERIN_ERP_COMPANY_DISCOVERY_V1",
      tenantId: tenant.id,
      tenantName: tenant.name,
      companyCode: tenant.companyCode,
      businessMode: normalizeBusinessMode(tenant.businessMode),
      serverUrl: tenant.discoveryServerUrl,
      caCertificate: tenant.discoveryCaCertificate,
      caFingerprint,
      discoveryVersion: tenant.discoveryVersion,
      licenseVersion: tenant.licenseVersion,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return NextResponse.json({ ok: true, discovery });
  } catch (error) {
    console.error("company discovery error", error);
    return NextResponse.json({ error: "公司連線查詢暫時無法使用" }, { status: 503 });
  }
}
