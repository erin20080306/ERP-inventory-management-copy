import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
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
  const ecommerce = tenant?.businessMode === "ECOMMERCE";
  const storeName = ecommerce ? String(body.storeName || body.name || tenant?.name || "").trim() : null;
  if (ecommerce && (!storeName || storeName.length > 80)) {
    throw new ApiError(400, "商城名稱需為 1–80 個字");
  }
  const storeSlug = ecommerce
    ? assertStoreSlug(body.storeSlug || existing?.storeSlug || tenant?.companyCode || tenantId)
    : null;
  if (ecommerce) {
    const conflict = await prisma.companySetting.findFirst({
      where: { storeSlug, tenantId: { not: tenantId } },
      select: { id: true },
    });
    if (conflict) throw new ApiError(409, "此商城網址已被使用，請改用其他網址代碼");
  }
  const data = {
    name: body.name,
    taxId: body.taxId,
    address: body.address,
    phone: body.phone,
    email: body.email,
    logoUrl: body.logoUrl,
    currency: body.currency || "TWD",
    ...(ecommerce ? { storeName, storeSlug } : {}),
    smtpHost: body.smtpHost || null,
    smtpPort: body.smtpPort ? Number(body.smtpPort) : null,
    smtpSecure: body.smtpSecure !== false,
    smtpUser: body.smtpUser || null,
    smtpFromName: body.smtpFromName || body.name || null,
    smtpFromEmail: body.smtpFromEmail || body.email || null,
    ...(body.smtpPassword ? { smtpPassword: body.smtpPassword } : {}),
  };
  const saved = existing
    ? await prisma.companySetting.update({ where: { id: existing.id }, data })
    : await prisma.companySetting.create({ data: { ...data, tenantId } });
  await audit({ userId: session.user.id, action: "update", module: "settings", refId: saved.id });
  return NextResponse.json({
    company: sanitizeCompanySetting(saved),
    businessMode: tenant?.businessMode,
    storefrontUrl: ecommerce && saved.storeSlug ? storefrontUrl(saved.storeSlug) : null,
  });
});
