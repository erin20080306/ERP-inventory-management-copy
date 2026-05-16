import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.edit");
  const tenantId = await requireTenantId();
  const { action } = await req.json();
  if (action === "post") {
    await requirePermission("journals.approve");
    await prisma.journalEntry.update({ where: { id: params.id, tenantId }, data: { status: "POSTED" } });
  } else if (action === "void") {
    await requirePermission("journals.void");
    await prisma.journalEntry.update({ where: { id: params.id, tenantId }, data: { status: "VOID" } });
  }
  await audit({ userId: session.user.id, action, module: "journals", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.delete");
  const tenantId = await requireTenantId();
  const j = await prisma.journalEntry.findUnique({ where: { id: params.id, tenantId } });
  if (j?.status === "POSTED") throw new Error("已過帳傳票不可刪除");
  await prisma.journalEntry.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "journals", refId: params.id });
  return NextResponse.json({ ok: true });
});
