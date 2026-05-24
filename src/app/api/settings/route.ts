import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

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
  const company = await prisma.companySetting.findFirst({ where: { tenantId } });
  return NextResponse.json({ company: sanitizeCompanySetting(company) });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("settings.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const existing = await prisma.companySetting.findFirst({ where: { tenantId } });
  const data = {
    name: body.name,
    taxId: body.taxId,
    address: body.address,
    phone: body.phone,
    email: body.email,
    logoUrl: body.logoUrl,
    currency: body.currency || "TWD",
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
  return NextResponse.json(sanitizeCompanySetting(saved));
});
