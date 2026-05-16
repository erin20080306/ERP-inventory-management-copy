import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("suppliers.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q
    ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }, { taxId: { contains: q } }, { phone: { contains: q } }] }
    : {};
  const [items, total] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supplier.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("suppliers.create");
  const created = await prisma.supplier.create({ data: await req.json() });
  await audit({ userId: session.user.id, action: "create", module: "suppliers", refId: created.id });
  return NextResponse.json(created);
});
