import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("products.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const u = await prisma.product.update({ where: { id: params.id, tenantId }, data: body });
  await audit({ userId: session.user.id, action: "update", module: "products", refId: params.id });
  return NextResponse.json(u);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("products.delete");
  const tenantId = await requireTenantId();
  await prisma.product.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "products", refId: params.id });
  return NextResponse.json({ ok: true });
});
