import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("warehouses.view");
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const where: any = q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {};
  const items = await prisma.warehouse.findMany({ where, orderBy: { code: "asc" } });
  return NextResponse.json({ items, total: items.length });
});
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("warehouses.create");
  const created = await prisma.warehouse.create({ data: await req.json() });
  await audit({ userId: session.user.id, action: "create", module: "warehouses", refId: created.id });
  return NextResponse.json(created);
});
