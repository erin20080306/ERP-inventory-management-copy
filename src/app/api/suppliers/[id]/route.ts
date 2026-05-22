import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("suppliers.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const u = await prisma.supplier.update({ where: { id: params.id, tenantId }, data: { ...body, updatedBy: currentUserId } });
  await audit({ userId: session.user.id, action: "update", module: "suppliers", refId: params.id });
  return NextResponse.json(u);
});
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("suppliers.delete");
  const tenantId = await requireTenantId();
  await prisma.supplier.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "suppliers", refId: params.id });
  return NextResponse.json({ ok: true });
});
