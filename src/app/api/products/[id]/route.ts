import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("products.edit");
  const body = await req.json();
  const u = await prisma.product.update({ where: { id: params.id }, data: body });
  await audit({ userId: session.user.id, action: "update", module: "products", refId: params.id });
  return NextResponse.json(u);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("products.delete");
  await prisma.product.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "products", refId: params.id });
  return NextResponse.json({ ok: true });
});
