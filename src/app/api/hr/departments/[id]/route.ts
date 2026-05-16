import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("hr.edit");
  const body = await req.json();
  const updated = await prisma.department.update({
    where: { id: params.id },
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
  await prisma.department.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "departments", refId: params.id });
  return NextResponse.json({ ok: true });
});
