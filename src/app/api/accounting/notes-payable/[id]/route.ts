import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
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
  const body = await req.json();
  const { action, ...patch } = body;
  const n = await prisma.notePayable.findUnique({ where: { id: params.id, tenantId } });
  if (!n) throw new Error("找不到票據");

  let data: any = {};
  if (action === "clear") data = { status: "CLEARED", clearedDate: new Date() };
  else if (action === "bounce") data = { status: "BOUNCED" };
  else if (action === "void") data = { status: "VOID" };
  else {
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
