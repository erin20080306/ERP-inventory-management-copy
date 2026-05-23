import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("receivables.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const ar = await prisma.accountsReceivable.findUnique({ 
    where: { id: params.id },
    include: { payments: true, notes: true },
  });
  if (!ar || ar.tenantId !== tenantId) throw new Error("找不到應收帳款");
  
  // 級聯刪除相關收款紀錄和票據
  await prisma.$transaction(async (tx: any) => {
    // 刪除相關收款紀錄
    if (ar.payments.length > 0) {
      await tx.receivePayment.deleteMany({ where: { receivableId: params.id } });
    }
    // 刪除相關票據
    if (ar.notes.length > 0) {
      await tx.noteReceivable.deleteMany({ where: { receivableId: params.id } });
    }
    // 刪除應收帳款
    await tx.accountsReceivable.delete({ where: { id: params.id } });
  });
  
  await audit({ userId: session.user.id, action: "delete", module: "receivables", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("receivables.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { action } = body;

  if (action === "submit") {
    await requirePermission("receivables.submit");
    await prisma.accountsReceivable.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
  } else if (action === "approve") {
    await requirePermission("receivables.approve");
    await prisma.accountsReceivable.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
  } else if (action === "reject") {
    await requirePermission("receivables.reject");
    await prisma.accountsReceivable.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("receivables.post");
    await prisma.accountsReceivable.update({ where: { id: params.id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
  } else if (action === "void") {
    await requirePermission("receivables.void");
    await prisma.accountsReceivable.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
  }

  await audit({ userId: session.user.id, action, module: "receivables", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("receivables.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { amount, dueDate, status } = body;
  
  const ar = await prisma.accountsReceivable.findUnique({ 
    where: { id: params.id },
    include: { payments: true },
  });
  if (!ar || ar.tenantId !== tenantId) throw new Error("找不到應收帳款");
  
  // 如果更改金額或狀態，需要更新相關收款紀錄
  const updated = await prisma.$transaction(async (tx: any) => {
    let newPaidAmount = Number(ar.paidAmount);
    let newStatus = status || ar.status;
    
    // 如果將狀態改為未收，重置已收款金額
    if (status === "OPEN" && Number(ar.paidAmount) > 0) {
      newPaidAmount = 0;
      // 刪除相關收款紀錄
      await tx.receivePayment.deleteMany({ where: { receivableId: params.id } });
    }
    
    const updated = await tx.accountsReceivable.update({
      where: { id: params.id },
      data: {
        amount: amount !== undefined ? Number(amount) : ar.amount,
        dueDate: dueDate !== undefined ? new Date(dueDate) : ar.dueDate,
        paidAmount: newPaidAmount,
        status: newStatus,
        updatedBy: currentUserId,
      },
    });
    
    return updated;
  });
  
  await audit({ userId: session.user.id, action: "edit", module: "receivables", refId: params.id });
  return NextResponse.json(updated);
});
