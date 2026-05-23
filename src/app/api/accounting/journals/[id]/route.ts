import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("journals.view");
  const tenantId = await requireTenantId();
  const entry = await prisma.journalEntry.findUnique({
    where: { id: params.id, tenantId },
    include: { lines: { include: { account: true } } },
  });
  return NextResponse.json(entry);
});

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.edit");
  const tenantId = await requireTenantId();
  const existing = await prisma.journalEntry.findUnique({ where: { id: params.id, tenantId } });
  if (!existing) throw new Error("找不到傳票");
  const { summary, entryDate, lines } = await req.json();
  if (!lines?.length) throw new Error("請至少新增一筆分錄");
  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001 || totalDebit === 0) throw new Error("借貸必須平衡且金額不可為 0");
  await prisma.journalEntryLine.deleteMany({ where: { entryId: params.id } });
  const updated = await prisma.journalEntry.update({
    where: { id: params.id, tenantId },
    data: {
      summary,
      entryDate: new Date(entryDate),
      lines: {
        create: lines.map((l: any) => ({
          accountId: l.accountId,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          memo: l.memo || "",
        })),
      },
    },
    include: { lines: { include: { account: true } } },
  });
  await audit({ userId: session.user.id, action: "edit", module: "journals", refId: params.id });
  return NextResponse.json(updated);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { action } = body;
  if (action === "post") {
    await requirePermission("journals.approve");
    await prisma.journalEntry.update({ where: { id: params.id, tenantId }, data: { status: "POSTED" } });
  } else if (action === "void") {
    await requirePermission("journals.void");
    await prisma.journalEntry.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED" } });
  } else if (action === "update-header") {
    const data: any = {};
    if (body.summary !== undefined) data.summary = body.summary;
    if (body.entryDate !== undefined) data.entryDate = new Date(body.entryDate);
    await prisma.journalEntry.update({ where: { id: params.id, tenantId }, data });
  }
  await audit({ userId: session.user.id, action, module: "journals", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.delete");
  const tenantId = await requireTenantId();
  
  // 檢查關聯記錄
  const entry = await prisma.journalEntry.findUnique({
    where: { id: params.id, tenantId },
    include: { lines: true },
  });
  if (!entry) throw new Error("找不到傳票");
  
  // 檢查是否有相關的應收應付記錄
  const relatedReceivables = await prisma.accountsReceivable.findMany({
    where: { invoiceId: params.id },
  });
  const relatedPayables = await prisma.accountsPayable.findMany({
    where: { invoiceId: params.id },
  });
  
  const hasRelated = relatedReceivables.length > 0 || relatedPayables.length > 0;
  
  if (hasRelated) {
    const relatedInfo = [];
    if (relatedReceivables.length > 0) relatedInfo.push(`應收帳款 (${relatedReceivables.length}筆)`);
    if (relatedPayables.length > 0) relatedInfo.push(`應付帳款 (${relatedPayables.length}筆)`);
    
    throw new Error(`此傳票關聯以下記錄，刪除將同時刪除這些記錄：${relatedInfo.join("、")}。請先刪除相關記錄。`);
  }
  
  await prisma.journalEntry.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "journals", refId: params.id });
  return NextResponse.json({ ok: true });
});
