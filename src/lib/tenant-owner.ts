import { ApiError, requirePermission, requireTenantId } from "./api";
import { prisma } from "./prisma";

export const TENANT_OWNER_ROLE_NAME = "系統管理員";

export async function requireTenantOwner(permission: string) {
  const session = await requirePermission(permission);
  const tenantId = await requireTenantId(session);
  if (session.user.isSuperAdmin || !session.user.isTenantOwner) {
    throw new ApiError(403, "只有此租戶的擁有人可以管理使用者與權限");
  }
  return { session, tenantId };
}

export async function getGlobalTenantOwnerRoleId() {
  const role = await prisma.role.findFirst({
    where: { tenantId: null, name: TENANT_OWNER_ROLE_NAME },
    select: { id: true },
  });
  if (!role) throw new ApiError(503, "系統管理員角色尚未初始化");
  return role.id;
}

export async function validateAssignableRoleIds(
  tenantId: string,
  input: unknown,
  options: { allowTenantOwnerRole?: boolean } = {},
) {
  if (!Array.isArray(input)) throw new ApiError(400, "角色資料格式不正確");
  const roleIds = [...new Set(input.filter((value): value is string => typeof value === "string" && Boolean(value.trim())))];
  if (roleIds.length === 0) return [];

  const roles = await prisma.role.findMany({
    where: {
      id: { in: roleIds },
      OR: [{ tenantId }, { tenantId: null }],
    },
    select: { id: true, tenantId: true, name: true },
  });
  if (roles.length !== roleIds.length) throw new ApiError(400, "包含其他租戶或不存在的角色");
  if (!options.allowTenantOwnerRole && roles.some((role) => role.tenantId === null && role.name === TENANT_OWNER_ROLE_NAME)) {
    throw new ApiError(403, "租戶擁有人角色不可指派給新增使用者");
  }
  return roleIds;
}

export async function validatePermissionIds(input: unknown) {
  if (!Array.isArray(input)) throw new ApiError(400, "權限資料格式不正確");
  const permissionIds = [...new Set(input.filter((value): value is string => typeof value === "string" && Boolean(value.trim())))];
  if (permissionIds.length === 0) return [];
  const count = await prisma.permission.count({ where: { id: { in: permissionIds } } });
  if (count !== permissionIds.length) throw new ApiError(400, "包含不存在的權限");
  return permissionIds;
}
