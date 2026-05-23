import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("notes.view");
  const tenantId = await requireTenantId();
  const n = await prisma.notePayable.findUnique({
    where: { id: params.id, tenantId },
    include: { supplier: true, payable: true, bankAccount: true },
  });
  if (!n) throw new Error("找不到票據");
  return NextResponse.json(n);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("notes.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { action, ...patch } = body;
  const n = await prisma.notePayable.findUnique({ where: { id: params.id, tenantId } });
  if (!n) throw new Error("找不到票據");

  let data: any = {};
  if (action === "submit") {
    await requirePermission("notes.submit");
    data = { status: "SUBMITTED", updatedBy: currentUserId };
  } else if (action === "approve") {
    await requirePermission("notes.approve");
    data = { status: "APPROVED", updatedBy: currentUserId };
  } else if (action === "reject") {
    await requirePermission("notes.reject");
    data = { status: "REJECTED", updatedBy: currentUserId };
  } else if (action === "post") {
    await requirePermission("notes.post");
    data = { status: "POSTED", updatedBy: currentUserId };
  } else if (action === "void") {
    await requirePermission("notes.void");
    data = { status: "VOIDED", updatedBy: currentUserId };
  } else {
    data = {
      noteNumber: patch.noteNumber,
      noteType: patch.noteType,
      payeeName: patch.payeeName,
      bankAccountId: patch.bankAccountId,
      amount: patch.amount != null ? Number(patch.amount) : undefined,
      dueDate: patch.dueDate ? new Date(patch.dueDate) : undefined,
      issueDate: patch.issueDate ? new Date(patch.issueDate) : undefined,
      remark: patch.remark,
    };
  }
  const updated = await prisma.notePayable.update({ where: { id: params.id, tenantId }, data });
  await audit({ userId: session.user.id, action: action ?? "update", module: "notes-payable", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("notes.delete");
  const tenantId = await requireTenantId();
  await prisma.notePayable.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "notes-payable", refId: params.id });
  return NextResponse.json({ ok: true });
});
