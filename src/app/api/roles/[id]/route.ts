import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit, logPermissionChange, getClientInfo } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("roles.edit");
  const { name, description, permissionIds } = await req.json();
  const { ip, userAgent } = getClientInfo(req);
  
  // Get current permissions before update
  const currentRole = await prisma.role.findUnique({
    where: { id: params.id },
    include: { permissions: true },
  });
  if (!currentRole) throw new Error("找不到角色");
  
  const beforePermissions = currentRole.permissions.map((p: any) => p.id);
  
  await prisma.role.update({ where: { id: params.id }, data: { name, description } });
  if (Array.isArray(permissionIds)) {
    await prisma.rolePermission.deleteMany({ where: { roleId: params.id } });
    if (permissionIds.length) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((pid: string) => ({ roleId: params.id, permissionId: pid })),
      });
    }
  }
  
  // Log permission change
  await logPermissionChange({
    userId: session.user.id,
    roleId: params.id,
    roleName: name || currentRole.name,
    action: "update",
    before: JSON.stringify(beforePermissions),
    after: JSON.stringify(permissionIds || []),
    ip,
    userAgent,
  });
  
  await audit({ userId: session.user.id, action: "update", module: "roles", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("roles.delete");
  const { ip, userAgent } = getClientInfo(req);
  
  const r = await prisma.role.findUnique({ 
    where: { id: params.id },
    include: { permissions: true },
  });
  if (r?.isSystem) throw new Error("系統角色不可刪除");
  
  // Get current permissions before delete
  const beforePermissions = r?.permissions.map((p: any) => p.id) || [];
  
  await prisma.role.delete({ where: { id: params.id } });
  
  // Log permission change
  await logPermissionChange({
    userId: session.user.id,
    roleId: params.id,
    roleName: r?.name || "unknown",
    action: "delete",
    before: JSON.stringify(beforePermissions),
    ip,
    userAgent,
  });
  
  await audit({ userId: session.user.id, action: "delete", module: "roles", refId: params.id });
  return NextResponse.json({ ok: true });
});
