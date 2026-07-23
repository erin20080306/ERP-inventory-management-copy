import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { invalidateLicenseAccessCache, refreshLocalLicenseLease } from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { assertStoreSlug, normalizeStoreSlug, storefrontUrl } from "@/lib/storefront-branding";

function sanitizeCompanySetting(company: any) {
  return company
    ? {
        ...company,
        smtpPassword: "",
        hasSmtpPassword: Boolean(company.smtpPassword),
      }
    : null;
}

export const GET = apiHandler(async () => {
  await requirePermission("settings.view");
  const tenantId = await requireTenantId();
  const [company, tenant] = await Promise.all([
    prisma.companySetting.findFirst({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessMode: true, companyCode: true } }),
  ]);
  const storefrontKey = company?.storeSlug || normalizeStoreSlug(tenant?.companyCode || tenantId);
  return NextResponse.json({
    company: sanitizeCompanySetting(company),
    businessMode: tenant?.businessMode,
    storefrontUrl: tenant?.businessMode === "ECOMMERCE" && storefrontKey ? storefrontUrl(storefrontKey) : null,
  });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("settings.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const [existing, tenant] = await Promise.all([
    prisma.companySetting.findFirst({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessMode: true, companyCode: true, name: true } }),
  ]);
  if (!tenant) throw new ApiError(404, "找不到公司資料");
  const companyName = String(body.name || "").trim();
  if (!companyName || companyName.length > 200) {
    throw new ApiError(400, "公司名稱需為 1–200 個字");
  }
  const companyNameChanged = companyName !== tenant.name;
  if (companyNameChanged && process.env.LOCAL_LICENSE_MODE === "true") {
    const centralUrl = process.env.CENTRAL_LICENSE_URL?.replace(/\/$/, "");
    const activationKey = process.env.LOCAL_ACTIVATION_KEY;
    const deviceId = process.env.LOCAL_DEVICE_ID;
    if (!centralUrl || !activationKey || !deviceId) {
      throw new ApiError(503, "公司主機尚未完成中央授權設定，暫時無法同步公司名稱");
    }
    const response = await fetch(`${centralUrl}/api/license/company-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activationKey, deviceId, companyName }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(response.status >= 500 ? 502 : response.status, result?.error || "中央公司資料同步失敗");
    }
  }
  const ecommerce = tenant?.businessMode === "ECOMMERCE";
  const storeName = ecommerce ? String(body.storeName || body.name || tenant?.name || "").trim() : null;
  if (ecommerce && (!storeName || storeName.length > 80)) {
    throw new ApiError(400, "商城名稱需為 1–80 個字");
  }
  const storeSlug = ecommerce
    ? assertStoreSlug(body.storeSlug || existing?.storeSlug || tenant?.companyCode || tenantId)
    : null;
  const storeTransferBankName = ecommerce ? String(body.storeTransferBankName || "").trim() || null : undefined;
  const storeTransferAccountName = ecommerce ? String(body.storeTransferAccountName || "").trim() || null : undefined;
  const storeTransferAccountNumber = ecommerce ? String(body.storeTransferAccountNumber || "").trim() || null : undefined;
  if ([storeTransferBankName, storeTransferAccountName, storeTransferAccountNumber].some((value) => value && value.length > 100)) {
    throw new ApiError(400, "商城匯款資料每欄不可超過 100 個字");
  }
  if (ecommerce) {
    const conflict = await prisma.companySetting.findFirst({
      where: { storeSlug, tenantId: { not: tenantId } },
      select: { id: true },
    });
    if (conflict) throw new ApiError(409, "此商城網址已被使用，請改用其他網址代碼");
  }
  const data = {
    name: companyName,
    taxId: body.taxId,
    address: body.address,
    phone: body.phone,
    email: body.email,
    logoUrl: body.logoUrl,
    currency: body.currency || "TWD",
    ...(ecommerce ? {
      storeName,
      storeSlug,
      storeTransferBankName,
      storeTransferAccountName,
      storeTransferAccountNumber,
    } : {}),
    smtpHost: body.smtpHost || null,
    smtpPort: body.smtpPort ? Number(body.smtpPort) : null,
    smtpSecure: body.smtpSecure !== false,
    smtpUser: body.smtpUser || null,
    smtpFromName: body.smtpFromName || body.name || null,
    smtpFromEmail: body.smtpFromEmail || body.email || null,
    ...(body.smtpPassword ? { smtpPassword: body.smtpPassword } : {}),
  };
  const saved = await prisma.$transaction(async (tx) => {
    const company = existing
      ? await tx.companySetting.update({ where: { id: existing.id }, data })
      : await tx.companySetting.create({ data: { ...data, tenantId } });
    if (companyNameChanged) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: process.env.LOCAL_LICENSE_MODE === "true"
          ? { name: companyName }
          : {
              name: companyName,
              licenseVersion: { increment: 1 },
              licenseUpdatedAt: new Date(),
            },
      });
    }
    return company;
  });
  if (companyNameChanged) {
    invalidateLicenseAccessCache(tenantId);
    if (process.env.LOCAL_LICENSE_MODE === "true") {
      await refreshLocalLicenseLease(tenantId);
    }
  }
  await audit({ userId: session.user.id, action: "update", module: "settings", refId: saved.id });
  return NextResponse.json({
    company: sanitizeCompanySetting(saved),
    businessMode: tenant?.businessMode,
    storefrontUrl: ecommerce && saved.storeSlug ? storefrontUrl(saved.storeSlug) : null,
  });
});
