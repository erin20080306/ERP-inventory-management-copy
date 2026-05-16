import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("roles.edit");
  const { name, description, permissionIds } = await req.json();
  await prisma.role.update({ where: { id: params.id }, data: { name, description } });
  if (Array.isArray(permissionIds)) {
    await prisma.rolePermission.deleteMany({ where: { roleId: params.id } });
    if (permissionIds.length) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((pid: string) => ({ roleId: params.id, permissionId: pid })),
      });
    }
  }
  await audit({ userId: session.user.id, action: "update", module: "roles", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("roles.delete");
  const r = await prisma.role.findUnique({ where: { id: params.id } });
  if (r?.isSystem) throw new Error("系統角色不可刪除");
  await prisma.role.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "roles", refId: params.id });
  return NextResponse.json({ ok: true });
});
