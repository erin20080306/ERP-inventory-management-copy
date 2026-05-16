import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("users.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
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
      lastLoginAt: u.lastLoginAt,
      roles: u.userRoles.map((ur: any) => ({ id: ur.role.id, name: ur.role.name })),
    })),
    total,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("users.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { username, name, email, password, roleIds, isActive } = body;
  if (!password || password.length < 6) throw new Error("密碼至少 6 碼");
  const hash = await bcrypt.hash(password, 12);
  const created = await prisma.user.create({
    data: { tenantId, username, name, email, passwordHash: hash, isActive: isActive ?? true },
  });
  if (roleIds?.length) {
    await prisma.userRole.createMany({ data: roleIds.map((rid: string) => ({ userId: created.id, roleId: rid })) });
  }
  await audit({ userId: session.user.id, action: "create", module: "users", refId: created.id });
  return NextResponse.json({ id: created.id });
});
