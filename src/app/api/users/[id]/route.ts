import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getGlobalTenantOwnerRoleId, requireTenantOwner, validateAssignableRoleIds } from "@/lib/tenant-owner";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { session, tenantId } = await requireTenantOwner("users.edit");
  const body = await req.json();
  const { name, email, password, roleIds, isActive } = body;
  const target = await prisma.user.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, isActive: true, isTenantOwner: true },
  });
  if (!target) throw new ApiError(404, "找不到此租戶的使用者");
  if (target.isTenantOwner && isActive === false) throw new ApiError(403, "租戶擁有人不可停用");

  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedName) throw new ApiError(400, "姓名不可為空白");
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new ApiError(400, "Email 格式不正確");
  if (password && password.length < 8) throw new ApiError(400, "新密碼至少 8 碼");
  const assignableRoleIds = await validateAssignableRoleIds(
    tenantId,
    roleIds ?? [],
    { allowTenantOwnerRole: target.isTenantOwner },
  );
  const effectiveRoleIds = target.isTenantOwner
    ? [...new Set([...assignableRoleIds, await getGlobalTenantOwnerRoleId()])]
    : assignableRoleIds;
  const data: any = {
    name: normalizedName,
    email: normalizedEmail,
    isActive: target.isTenantOwner
      ? true
      : typeof isActive === "boolean"
        ? isActive
        : target.isActive,
  };
  if (password) data.passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data });
    await tx.userRole.deleteMany({ where: { userId: target.id } });
    if (effectiveRoleIds.length) {
      await tx.userRole.createMany({
        data: effectiveRoleIds.map((roleId) => ({ userId: target.id, roleId })),
      });
    }
  });
  await audit({ userId: session.user.id, action: "update", module: "users", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { session, tenantId } = await requireTenantOwner("users.delete");
  const target = await prisma.user.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, isTenantOwner: true },
  });
  if (!target) throw new ApiError(404, "找不到此租戶的使用者");
  if (target.isTenantOwner || session.user.id === target.id) throw new ApiError(403, "租戶擁有人不可刪除");
  await prisma.user.delete({ where: { id: target.id } });
  await audit({ userId: session.user.id, action: "delete", module: "users", refId: params.id });
  return NextResponse.json({ ok: true });
});
