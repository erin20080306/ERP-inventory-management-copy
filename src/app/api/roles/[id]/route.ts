import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, audit, logPermissionChange, getClientInfo } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireTenantOwner, validatePermissionIds } from "@/lib/tenant-owner";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { session, tenantId } = await requireTenantOwner("roles.edit");
  const body = await req.json();
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim() || null;
  if (!name || name.length > 80) throw new ApiError(400, "角色名稱需為 1～80 個字元");
  const permissionIds = await validatePermissionIds(body.permissionIds ?? []);
  const { ip, userAgent } = getClientInfo(req);

  const currentRole = await prisma.role.findFirst({
    where: { id: params.id, tenantId },
    include: { permissions: true },
  });
  if (!currentRole) throw new ApiError(404, "找不到此租戶可編輯的角色");
  const duplicate = await prisma.role.findFirst({
    where: { tenantId, name, NOT: { id: params.id } },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, "此租戶已存在同名角色");
  const beforePermissions = currentRole.permissions.map((p) => p.permissionId);

  await prisma.$transaction(async (tx) => {
    await tx.role.update({ where: { id: params.id }, data: { name, description } });
    await tx.rolePermission.deleteMany({ where: { roleId: params.id } });
    if (permissionIds.length) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: params.id, permissionId })),
      });
    }
  });

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
  const { session, tenantId } = await requireTenantOwner("roles.delete");
  const { ip, userAgent } = getClientInfo(req);

  const r = await prisma.role.findFirst({
    where: { id: params.id, tenantId },
    include: { permissions: true },
  });
  if (!r) throw new ApiError(404, "找不到此租戶可刪除的角色");
  const beforePermissions = r.permissions.map((p) => p.permissionId);

  await prisma.role.delete({ where: { id: params.id } });

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
