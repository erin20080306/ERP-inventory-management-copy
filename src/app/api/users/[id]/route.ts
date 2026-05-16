import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("users.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { name, email, password, roleIds, isActive } = body;
  const data: any = { name, email, isActive };
  if (password && password.length >= 6) data.passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: params.id, tenantId }, data });
  if (Array.isArray(roleIds)) {
    await prisma.userRole.deleteMany({ where: { userId: params.id } });
    if (roleIds.length) {
      await prisma.userRole.createMany({ data: roleIds.map((rid: string) => ({ userId: params.id, roleId: rid })) });
    }
  }
  await audit({ userId: session.user.id, action: "update", module: "users", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("users.delete");
  const tenantId = await requireTenantId();
  if (session.user.id === params.id) throw new Error("不可刪除自己");
  await prisma.user.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "users", refId: params.id });
  return NextResponse.json({ ok: true });
});
