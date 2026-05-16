import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("accounting.edit");
  const u = await prisma.chartOfAccount.update({ where: { id: params.id }, data: await req.json() });
  await audit({ userId: session.user.id, action: "update", module: "accounting", refId: params.id });
  return NextResponse.json(u);
});
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("accounting.delete");
  await prisma.chartOfAccount.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "accounting", refId: params.id });
  return NextResponse.json({ ok: true });
});
