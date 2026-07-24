import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit, logPermissionChange, getClientInfo } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireTenantOwner, validatePermissionIds } from "@/lib/tenant-owner";

export const GET = apiHandler(async () => {
  const session = await requirePermission("roles.view");
  const tenantId = await requireTenantId(session);
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      include: { permissions: true },
      orderBy: [{ tenantId: "asc" }, { name: "asc" }],
    }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] }),
  ]);
  return NextResponse.json({ roles, permissions });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const { session, tenantId } = await requireTenantOwner("roles.create");
  const body = await req.json();
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim() || null;
  if (!name || name.length > 80) throw new ApiError(400, "角色名稱需為 1～80 個字元");
  const permissionIds = await validatePermissionIds(body.permissionIds ?? []);
  const { ip, userAgent } = getClientInfo(req);

  const duplicate = await prisma.role.findFirst({ where: { tenantId, name }, select: { id: true } });
  if (duplicate) throw new ApiError(409, "此租戶已存在同名角色");
  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({ data: { tenantId, name, description } });
    if (permissionIds.length) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: created.id, permissionId })),
      });
    }
    return created;
  });

  await logPermissionChange({
    userId: session.user.id,
    roleId: role.id,
    roleName: name,
    action: "create",
    after: JSON.stringify(permissionIds || []),
    ip,
    userAgent,
  });

  await audit({ userId: session.user.id, action: "create", module: "roles", refId: role.id });
  return NextResponse.json(role);
});
