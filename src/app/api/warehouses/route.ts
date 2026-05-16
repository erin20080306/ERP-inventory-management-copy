import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("warehouses.view");
  const tenantId = await requireTenantId();
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const where: any = q ? { tenantId, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : { tenantId };
  const items = await prisma.warehouse.findMany({ where, orderBy: { code: "asc" } });
  return NextResponse.json({ items, total: items.length });
});
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("warehouses.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const created = await prisma.warehouse.create({ data: { ...body, tenantId } });
  await audit({ userId: session.user.id, action: "create", module: "warehouses", refId: created.id });
  return NextResponse.json(created);
});
