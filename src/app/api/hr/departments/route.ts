import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("hr.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const where: any = q
    ? { tenantId, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
    : { tenantId };
  const items = await prisma.department.findMany({ where, orderBy: { code: "asc" } });
  return NextResponse.json({ items, total: items.length });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("hr.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  if (!body.code) throw new Error("請輸入部門編號");
  if (!body.name) throw new Error("請輸入部門名稱");
  const created = await prisma.department.create({
    data: {
      tenantId,
      code: body.code,
      name: body.name,
      parentId: body.parentId || null,
      isActive: body.isActive ?? true,
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "departments", refId: created.id });
  return NextResponse.json(created);
});
