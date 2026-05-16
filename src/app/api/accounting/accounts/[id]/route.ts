import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("accounting.edit");
  const tenantId = await requireTenantId();
  const u = await prisma.chartOfAccount.update({ where: { id: params.id, tenantId }, data: await req.json() });
  await audit({ userId: session.user.id, action: "update", module: "accounting", refId: params.id });
  return NextResponse.json(u);
});
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("accounting.delete");
  const tenantId = await requireTenantId();
  await prisma.chartOfAccount.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "accounting", refId: params.id });
  return NextResponse.json({ ok: true });
});
