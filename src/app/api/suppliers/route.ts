import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("suppliers.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q
    ? { tenantId, OR: [{ code: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }, { taxId: { contains: q } }, { phone: { contains: q } }] }
    : { tenantId };
  const [items, total] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supplier.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("suppliers.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const created = await prisma.supplier.create({ data: { ...body, tenantId } });
  await audit({ userId: session.user.id, action: "create", module: "suppliers", refId: created.id });
  return NextResponse.json(created);
});
