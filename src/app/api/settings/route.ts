import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async () => {
  await requirePermission("settings.view");
  const tenantId = await requireTenantId();
  const company = await prisma.companySetting.findFirst({ where: { tenantId } });
  return NextResponse.json({ company });
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
  };
  const saved = existing
    ? await prisma.companySetting.update({ where: { id: existing.id }, data })
    : await prisma.companySetting.create({ data: { ...data, tenantId } });
  await audit({ userId: session.user.id, action: "update", module: "settings", refId: saved.id });
  return NextResponse.json(saved);
});
