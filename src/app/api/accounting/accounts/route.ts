import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("accounting.view");
  const tenantId = await requireTenantId();
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const where: any = q ? { tenantId, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : { tenantId };
  const items = await prisma.chartOfAccount.findMany({ where, orderBy: { code: "asc" } });
  return NextResponse.json({ items, total: items.length });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("accounting.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const upsert = req.nextUrl.searchParams.get("upsert") === "1";
  if (upsert && body.code) {
    const result = await prisma.chartOfAccount.upsert({
      where: { tenantId_code: { tenantId, code: body.code } },
      update: { name: body.name, type: body.type, openingBalance: body.openingBalance },
      create: { ...body, tenantId },
    });
    await audit({ userId: session.user.id, action: "upsert", module: "accounting", refId: result.id });
    return NextResponse.json(result);
  }
  const created = await prisma.chartOfAccount.create({ data: { ...body, tenantId } });
  await audit({ userId: session.user.id, action: "create", module: "accounting", refId: created.id });
  return NextResponse.json(created);
});
