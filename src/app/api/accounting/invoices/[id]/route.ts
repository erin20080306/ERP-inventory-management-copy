import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const { action } = await req.json();
  
  if (action === "submit") {
    await requirePermission("invoices.submit");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
  } else if (action === "approve") {
    await requirePermission("invoices.approve");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
  } else if (action === "reject") {
    await requirePermission("invoices.reject");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("invoices.post");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
  } else if (action === "void") {
    await requirePermission("invoices.void");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
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
