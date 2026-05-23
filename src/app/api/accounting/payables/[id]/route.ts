import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("payables.edit");
  const tenantId = await requireTenantId();
  const ap = await prisma.accountsPayable.findUnique({ where: { id: params.id } });
  if (!ap || ap.tenantId !== tenantId) throw new Error("找不到應付帳款");
  if (Number(ap.paidAmount) > 0) throw new Error("已有付款紀錄，無法刪除");
  await prisma.accountsPayable.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "payables", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("payables.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { action } = body;

  if (action === "submit") {
    await requirePermission("payables.submit");
    await prisma.accountsPayable.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
  } else if (action === "approve") {
    await requirePermission("payables.approve");
    await prisma.accountsPayable.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
  } else if (action === "reject") {
    await requirePermission("payables.reject");
    await prisma.accountsPayable.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("payables.post");
    await prisma.accountsPayable.update({ where: { id: params.id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
  } else if (action === "void") {
    await requirePermission("payables.void");
    await prisma.accountsPayable.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
  }

  await audit({ userId: session.user.id, action, module: "payables", refId: params.id });
  return NextResponse.json({ ok: true });
});
