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
  if (action === "submit") {
    await requirePermission("journals.submit");
    await prisma.journalEntry.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED" } });
  } else if (action === "approve") {
    await requirePermission("journals.approve");
    await prisma.journalEntry.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED" } });
  } else if (action === "reject") {
    await requirePermission("journals.reject");
    await prisma.journalEntry.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED" } });
  } else if (action === "post") {
    await requirePermission("journals.post");
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
  
  // 刪除關聯的應收應付記錄
  const receivables = await prisma.accountsReceivable.findMany({
    where: { invoiceId: params.id, tenantId },
  });
  const payables = await prisma.accountsPayable.findMany({
    where: { invoiceId: params.id, tenantId },
  });
  
  // 刪除關聯的應收票據
  if (receivables.length > 0) {
    await prisma.noteReceivable.deleteMany({
      where: { receivableId: { in: receivables.map((r) => r.id) } },
    });
  }
  
  // 刪除關聯的應付票據
  if (payables.length > 0) {
    await prisma.notePayable.deleteMany({
      where: { payableId: { in: payables.map((p) => p.id) } },
    });
  }
  
  await prisma.accountsReceivable.deleteMany({
    where: { invoiceId: params.id, tenantId },
  });
  await prisma.accountsPayable.deleteMany({
    where: { invoiceId: params.id, tenantId },
  });
  
  // 刪除關聯的銷貨單
  const salesOrders = await prisma.salesOrder.findMany({
    where: { tenantId },
    include: { items: true },
  });
  for (const so of salesOrders) {
    const journalExists = await prisma.journalEntry.findFirst({
      where: {
        tenantId,
        summary: { contains: `銷售確認 ${so.number}` },
        status: { not: "VOIDED" },
      },
    });
    if (journalExists && journalExists.id === params.id) {
      await prisma.salesOrderItem.deleteMany({ where: { orderId: so.id } });
      await prisma.salesOrder.delete({ where: { id: so.id, tenantId } });
    }
  }
  
  // 刪除關聯的採購單
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { tenantId },
    include: { items: true },
  });
  for (const po of purchaseOrders) {
    const journalExists = await prisma.journalEntry.findFirst({
      where: {
        tenantId,
        summary: { contains: `採購核准 ${po.number}` },
        status: { not: "VOIDED" },
      },
    });
    if (journalExists && journalExists.id === params.id) {
      await prisma.purchaseOrderItem.deleteMany({ where: { orderId: po.id } });
      await prisma.purchaseOrder.delete({ where: { id: po.id, tenantId } });
    }
  }
  
  // 刪除傳票
  await prisma.journalEntry.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "journals", refId: params.id });
  return NextResponse.json({ ok: true });
});
