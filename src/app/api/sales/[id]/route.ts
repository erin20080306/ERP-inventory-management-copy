import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { shipSalesOrder, calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("sales.view");
  const tenantId = await requireTenantId();
  const item = await prisma.salesOrder.findUnique({
    where: { id: params.id, tenantId },
    include: {
      customer: true,
      items: { include: { product: true } },
      shipments: {
        where: { status: "POSTED" },
        include: { warehouse: true, items: { include: { product: true } }, receivable: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return NextResponse.json(item);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("sales.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { action, warehouseId, items, remark } = body;
  const existing = await prisma.salesOrder.findUnique({ where: { id: params.id, tenantId } });
  if (!existing) throw new Error("找不到銷售單");

  let response: Record<string, unknown> = { ok: true };

  if (action === "submit") {
    await requirePermission("sales.submit");
    if (!["DRAFT", "REJECTED"].includes(existing.status)) throw new Error("只有草稿或退回單據可以送審");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
    response = { ok: true, message: "已送出審核" };
  } else if (action === "confirm" || action === "approve") {
    await requirePermission("sales.approve");
    if (existing.status !== "SUBMITTED") throw new Error("只有已送審銷售單可以核准");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
    response = { ok: true, message: "已核准；尚未出貨，不會先扣庫存或立應收" };
  } else if (action === "reject") {
    await requirePermission("sales.reject");
    if (existing.status !== "SUBMITTED") throw new Error("只有已送審銷售單可以退回");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    throw new Error("銷售單必須執行出貨，不可跳過庫存直接過帳");
  } else if (action === "ship") {
    await requirePermission("sales.post");
    if (!warehouseId) throw new Error("請選擇出貨倉庫");
    const result = await shipSalesOrder(params.id, warehouseId, tenantId, items, session.user.id, remark);
    await audit({
      userId: session.user.id,
      action,
      module: "sales",
      refId: params.id,
      detail: `出貨單 ${result.shipment.number}；${result.complete ? "全部完成" : "部分出貨"}`,
    });
    return NextResponse.json({
      ok: true,
      complete: result.complete,
      shipmentNumber: result.shipment.number,
      message: result.complete
        ? "出貨完成，庫存、應收帳款與銷貨傳票已同步"
        : "部分出貨完成，未交數量可於下次繼續出貨",
    });
  } else if (action === "cancel") {
    await requirePermission("sales.void");
    if (["PARTIALLY_SHIPPED", "POSTED"].includes(existing.status)) {
      throw new Error("已有出貨紀錄的單據必須走銷貨退回或沖銷，不可直接作廢");
    }
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
  } else {
    throw new Error("不支援的銷售動作");
  }
  await audit({ userId: session.user.id, action, module: "sales", refId: params.id });
  return NextResponse.json(response);
});

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("sales.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const existing = await prisma.salesOrder.findUnique({ where: { id: params.id, tenantId } });
  if (!existing) throw new Error("找不到銷售單");
  if (!["DRAFT", "REJECTED"].includes(existing.status)) {
    throw new Error("只有草稿或退回單據可以修改");
  }
  const body = await req.json();
  const { customerId, items, remark, isTaxable } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items, isTaxable !== false);
  // 先刪除舊的 items
  await prisma.salesOrderItem.deleteMany({ where: { orderId: params.id } });
  const updated = await prisma.salesOrder.update({
    where: { id: params.id, tenantId },
    data: {
      customerId,
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
    include: { items: true, customer: true },
  });
  // 更新關聯的 AR 金額
  const ar = await prisma.accountsReceivable.findFirst({ where: { salesOrderId: params.id, tenantId } });
  if (ar && Number(ar.paidAmount) === 0) {
    await prisma.accountsReceivable.update({ where: { id: ar.id }, data: { amount: totals.total } });
  }
  await audit({ userId: session.user.id, action: "edit", module: "sales", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("sales.delete");
  const tenantId = await requireTenantId();
  const o = await prisma.salesOrder.findUnique({ where: { id: params.id, tenantId } });
  if (!o) throw new Error("找不到銷售單");
  const canDelete = ["DRAFT", "REJECTED"].includes(o.status);
  if (!canDelete) throw new Error("送審後的單據須保留稽核軌跡，請改用退回或作廢");
  
  // 刪除關聯的傳票
  const journal = await prisma.journalEntry.findFirst({
    where: {
      tenantId,
      summary: { contains: `銷售確認 ${o.number}` },
      status: { not: "VOIDED" },
    },
  });
  if (journal) {
    await prisma.journalEntryLine.deleteMany({ where: { entryId: journal.id } });
    await prisma.journalEntry.delete({ where: { id: journal.id, tenantId } });
  }
  
  // 刪除關聯的 AR
  await prisma.accountsReceivable.deleteMany({ where: { salesOrderId: params.id, tenantId } });
  await prisma.salesOrder.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "sales", refId: params.id });
  return NextResponse.json({ ok: true });
});
