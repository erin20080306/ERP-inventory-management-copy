import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("suppliers.edit");
  const u = await prisma.supplier.update({ where: { id: params.id }, data: await req.json() });
  await audit({ userId: session.user.id, action: "update", module: "suppliers", refId: params.id });
  return NextResponse.json(u);
});
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("suppliers.delete");
  await prisma.supplier.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "suppliers", refId: params.id });
  return NextResponse.json({ ok: true });
});
