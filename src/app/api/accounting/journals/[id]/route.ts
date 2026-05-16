import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.edit");
  const { action } = await req.json();
  if (action === "post") {
    await requirePermission("journals.approve");
    await prisma.journalEntry.update({ where: { id: params.id }, data: { status: "POSTED" } });
  } else if (action === "void") {
    await requirePermission("journals.void");
    await prisma.journalEntry.update({ where: { id: params.id }, data: { status: "VOID" } });
  }
  await audit({ userId: session.user.id, action, module: "journals", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.delete");
  const j = await prisma.journalEntry.findUnique({ where: { id: params.id } });
  if (j?.status === "POSTED") throw new Error("已過帳傳票不可刪除");
  await prisma.journalEntry.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "journals", refId: params.id });
  return NextResponse.json({ ok: true });
});
