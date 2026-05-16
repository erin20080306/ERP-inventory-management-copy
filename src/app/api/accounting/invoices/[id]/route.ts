import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.edit");
  const tenantId = await requireTenantId();
  const { action } = await req.json();
  if (action === "void") {
    await requirePermission("invoices.void");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "VOID" } });
  }
  await audit({ userId: session.user.id, action, module: "invoices", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.delete");
  const tenantId = await requireTenantId();
  await prisma.invoice.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "invoices", refId: params.id });
  return NextResponse.json({ ok: true });
});
