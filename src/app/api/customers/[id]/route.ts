import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("customers.edit");
  const u = await prisma.customer.update({ where: { id: params.id }, data: await req.json() });
  await audit({ userId: session.user.id, action: "update", module: "customers", refId: params.id });
  return NextResponse.json(u);
});
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("customers.delete");
  await prisma.customer.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "customers", refId: params.id });
  return NextResponse.json({ ok: true });
});
