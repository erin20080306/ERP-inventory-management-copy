import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { receivePurchaseOrder, calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("purchases.view");
  const tenantId = await requireTenantId();
  const item = await prisma.purchaseOrder.findUnique({
    where: { id: params.id, tenantId },
    include: {
      supplier: true,
      items: { include: { product: true } },
      receipts: {
        where: { status: "POSTED" },
        include: { warehouse: true, items: { include: { product: true } }, payable: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return NextResponse.json(item);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("purchases.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { action, warehouseId, items, remark } = body;
  const existing = await prisma.purchaseOrder.findUnique({ where: { id: params.id, tenantId } });
  if (!existing) throw new Error("找不到採購單");

  if (action === "submit") {
    await requirePermission("purchases.submit");
    if (!["DRAFT", "REJECTED"].includes(existing.status)) throw new Error("只有草稿或退回單據可以送審");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
  } else if (action === "approve") {
    await requirePermission("purchases.approve");
    if (existing.status !== "SUBMITTED") throw new Error("只有已送審採購單可以核准");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
  } else if (action === "reject") {
    await requirePermission("purchases.reject");
    if (existing.status !== "SUBMITTED") throw new Error("只有已送審採購單可以退回");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    throw new Error("採購單必須執行進貨驗收，不可跳過庫存直接過帳");
  } else if (action === "receive") {
    await requirePermission("purchases.post");
    if (!warehouseId) throw new Error("請選擇入庫倉庫");
    const result = await receivePurchaseOrder(params.id, warehouseId, tenantId, items, session.user.id, remark);
    await audit({
      userId: session.user.id,
      action,
      module: "purchases",
      refId: params.id,
      detail: `驗收單 ${result.receipt.number}；${result.complete ? "全部完成" : "部分進貨"}`,
    });
    return NextResponse.json({
      ok: true,
      complete: result.complete,
      receiptNumber: result.receipt.number,
      message: result.complete
        ? "進貨完成，庫存、應付帳款與採購傳票已同步"
        : "部分進貨完成，未交數量可於下次繼續驗收",
    });
  } else if (action === "cancel") {
    await requirePermission("purchases.void");
    if (["PARTIALLY_RECEIVED", "POSTED"].includes(existing.status)) {
      throw new Error("已有進貨紀錄的單據必須走採購退貨或沖銷，不可直接作廢");
    }
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
  } else {
    throw new Error("不支援的採購動作");
  }
  await audit({ userId: session.user.id, action, module: "purchases", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("purchases.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const existing = await prisma.purchaseOrder.findUnique({ where: { id: params.id, tenantId } });
  if (!existing) throw new Error("找不到採購單");
  if (!["DRAFT", "REJECTED"].includes(existing.status)) {
    throw new Error("只有草稿或退回單據可以修改");
  }
  const body = await req.json();
  const { supplierId, items, remark, isTaxable } = body as any;
  if (!supplierId) throw new Error("請選擇供應商");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items, isTaxable !== false);
  await prisma.purchaseOrderItem.deleteMany({ where: { orderId: params.id } });
  const updated = await prisma.purchaseOrder.update({
    where: { id: params.id, tenantId },
    data: {
      supplierId,
      remark,
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      isTaxable: isTaxable !== false,
      updatedBy: currentUserId,
      items: {
        create: totals.computed.map((i: any) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount === "" ? 0 : (i.discount ?? 0),
          taxRate: i.taxRate === "" ? 0 : (i.taxRate ?? 0),
          subtotal: i.subtotal,
        })),
      },
    },
    include: { items: true, supplier: true },
  });
  const ap = await prisma.accountsPayable.findFirst({ where: { purchaseOrderId: params.id, tenantId } });
  if (ap && Number(ap.paidAmount) === 0) {
    await prisma.accountsPayable.update({ where: { id: ap.id }, data: { amount: totals.total } });
  }
  await audit({ userId: session.user.id, action: "edit", module: "purchases", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("purchases.delete");
  const tenantId = await requireTenantId();
  const order = await prisma.purchaseOrder.findUnique({ where: { id: params.id, tenantId } });
  if (!order) throw new Error("找不到採購單");
  const canDelete = ["DRAFT", "REJECTED"].includes(order.status);
  if (!canDelete) throw new Error("送審後的單據須保留稽核軌跡，請改用退回或作廢");
  
  // 刪除關聯的傳票
  const journal = await prisma.journalEntry.findFirst({
    where: {
      tenantId,
      summary: { contains: `採購核准 ${order.number}` },
      status: { not: "VOIDED" },
    },
  });
  if (journal) {
    await prisma.journalEntryLine.deleteMany({ where: { entryId: journal.id } });
    await prisma.journalEntry.delete({ where: { id: journal.id, tenantId } });
  }
  
  // 刪除關聯的 AP
  await prisma.accountsPayable.deleteMany({ where: { purchaseOrderId: params.id, tenantId } });
  await prisma.purchaseOrder.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "purchases", refId: params.id });
  return NextResponse.json({ ok: true });
});
