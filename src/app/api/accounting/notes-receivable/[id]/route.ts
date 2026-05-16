import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("notes.view");
  const n = await prisma.noteReceivable.findUnique({
    where: { id: params.id },
    include: { customer: true, receivable: true },
  });
  if (!n) throw new Error("找不到票據");
  return NextResponse.json(n);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("notes.edit");
  const body = await req.json();
  const { action, ...patch } = body;
  const n = await prisma.noteReceivable.findUnique({ where: { id: params.id } });
  if (!n) throw new Error("找不到票據");

  let data: any = {};
  if (action === "clear") {
    data = { status: "CLEARED", clearedDate: new Date() };
  } else if (action === "bounce") {
    data = { status: "BOUNCED" };
  } else if (action === "endorse") {
    data = { status: "ENDORSED" };
  } else if (action === "void") {
    data = { status: "VOID" };
  } else {
    // 一般更新
    data = {
      noteNumber: patch.noteNumber,
      noteType: patch.noteType,
      bankName: patch.bankName,
      branchName: patch.branchName,
      drawerName: patch.drawerName,
      amount: patch.amount != null ? Number(patch.amount) : undefined,
      dueDate: patch.dueDate ? new Date(patch.dueDate) : undefined,
      issueDate: patch.issueDate ? new Date(patch.issueDate) : undefined,
      remark: patch.remark,
    };
  }
  const updated = await prisma.noteReceivable.update({ where: { id: params.id }, data });
  await audit({ userId: session.user.id, action: action ?? "update", module: "notes-receivable", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("notes.delete");
  await prisma.noteReceivable.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "notes-receivable", refId: params.id });
  return NextResponse.json({ ok: true });
});
