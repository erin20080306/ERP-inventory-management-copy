import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requireTenantOwner, validateAssignableRoleIds } from "@/lib/tenant-owner";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("users.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const where: any = q ? { tenantId, OR: [{ username: { contains: q } }, { name: { contains: q } }, { email: { contains: q } }] } : { tenantId };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return NextResponse.json({
    items: items.map((u: any) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      isTenantOwner: u.isTenantOwner,
      lastLoginAt: u.lastLoginAt,
      roles: u.userRoles.map((ur: any) => ({
        id: ur.role.id,
        name: ur.role.name,
        tenantId: ur.role.tenantId,
        isSystem: ur.role.isSystem,
      })),
    })),
    total,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const { session, tenantId } = await requireTenantOwner("users.create");
  const body = await req.json();
  const { username, name, email, password, roleIds, isActive } = body;
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedUsername.length < 3 || normalizedUsername.length > 50 || /\s/.test(normalizedUsername)) {
    throw new ApiError(400, "帳號需為 3～50 個字元，且不可包含空白");
  }
  if (!normalizedName) throw new ApiError(400, "姓名不可為空白");
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new ApiError(400, "Email 格式不正確");
  if (!password || password.length < 8) throw new ApiError(400, "密碼至少 8 碼");
  const assignableRoleIds = await validateAssignableRoleIds(tenantId, roleIds ?? []);
  const hash = await bcrypt.hash(password, 12);
  // Get tenant's original trialStart from the first user (registration account)
  const firstUser = await prisma.user.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { trialStart: true },
  });
  const trialStart = firstUser?.trialStart || new Date();
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId,
        username: normalizedUsername,
        name: normalizedName,
        email: normalizedEmail,
        passwordHash: hash,
        isActive: isActive ?? true,
        isTenantOwner: false,
        trialStart,
        createdByUserId: session.user.id,
      },
    });
    if (assignableRoleIds.length) {
      await tx.userRole.createMany({
        data: assignableRoleIds.map((roleId) => ({ userId: user.id, roleId })),
      });
    }
    return user;
  });
  await audit({ userId: session.user.id, action: "create", module: "users", refId: created.id });
  return NextResponse.json({ id: created.id });
});
