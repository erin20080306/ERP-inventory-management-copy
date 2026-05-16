import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("hr.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const updated = await prisma.department.update({
    where: { id: params.id, tenantId },
    data: {
      code: body.code,
      name: body.name,
      parentId: body.parentId || null,
      isActive: body.isActive,
    },
  });
  await audit({ userId: session.user.id, action: "update", module: "departments", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("hr.delete");
  const tenantId = await requireTenantId();
  await prisma.department.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "departments", refId: params.id });
  return NextResponse.json({ ok: true });
});
