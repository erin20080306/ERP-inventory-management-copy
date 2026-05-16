import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async () => {
  await requirePermission("roles.view");
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({ include: { permissions: true }, orderBy: { name: "asc" } }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] }),
  ]);
  return NextResponse.json({ roles, permissions });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("roles.create");
  const { name, description, permissionIds } = await req.json();
  const role = await prisma.role.create({ data: { name, description } });
  if (permissionIds?.length) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((pid: string) => ({ roleId: role.id, permissionId: pid })),
    });
  }
  await audit({ userId: session.user.id, action: "create", module: "roles", refId: role.id });
  return NextResponse.json(role);
});
