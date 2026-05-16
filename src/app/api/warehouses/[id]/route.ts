import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("warehouses.edit");
  const tenantId = await requireTenantId();
  const u = await prisma.warehouse.update({ where: { id: params.id, tenantId }, data: await req.json() });
  await audit({ userId: session.user.id, action: "update", module: "warehouses", refId: params.id });
  return NextResponse.json(u);
});
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("warehouses.delete");
  const tenantId = await requireTenantId();
  await prisma.warehouse.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "warehouses", refId: params.id });
  return NextResponse.json({ ok: true });
});
