import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { shipSalesOrder, calcTotals } from "@/lib/documents";
import { buildARCreatedDraft, autoCreateJournal } from "@/lib/auto-journal";

async function loadSalesOrderForAccounting(id: string, tenantId: string) {
  const order = await prisma.salesOrder.findUnique({
    where: { id, tenantId },
    include: { customer: true, items: { include: { product: true } } },
  });
  if (!order) throw new Error("找不到銷售單");
  return order;
}

async function ensureSalesInventoryIssued(order: any, tenantId: string) {
  const issued = await prisma.inventoryTransaction.findFirst({
    where: { tenantId, refType: "SALES", refId: order.id, type: "SALES_OUT" },
    select: { id: true },
  });
  if (issued) return false;

  const defaultWh = await prisma.warehouse.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!defaultWh) return false;

  for (const item of order.items) {
    const stock = await prisma.inventoryStock.findUnique({
      where: { productId_warehouseId: { productId: item.productId, warehouseId: defaultWh.id } },
    });
    const newQty = Math.max(0, Number(stock?.quantity ?? 0) - Number(item.quantity));
    await prisma.inventoryStock.upsert({
      where: { productId_warehouseId: { productId: item.productId, warehouseId: defaultWh.id } },
      update: { quantity: newQty },
      create: { tenantId, productId: item.productId, warehouseId: defaultWh.id, quantity: 0 },
    });
    await prisma.inventoryTransaction.create({
      data: {
        tenantId,
        productId: item.productId,
        warehouseId: defaultWh.id,
        type: "SALES_OUT",
        quantity: Number(item.quantity) * -1,
        unitCost: item.product?.costPrice ?? 0,
        refType: "SALES",
        refId: order.id,
        remark: `銷售確認出庫 ${order.number}`,
      },
    });
  }
  return true;
}

async function ensureSalesReceivableAndJournal(order: any, tenantId: string, userId: string, receivableStatus: "DRAFT" | "POSTED") {
  let arCreated = false;
  const ar = await prisma.accountsReceivable.findFirst({ where: { salesOrderId: order.id, tenantId } });
  if (!ar) {
    await prisma.accountsReceivable.create({
      data: {
        tenantId,
        customerId: order.customerId,
        salesOrderId: order.id,
        amount: order.total,
        status: receivableStatus,
      },
    });
    arCreated = true;
  } else if (receivableStatus === "POSTED" && ar.status !== "POSTED") {
    await prisma.accountsReceivable.update({ where: { id: ar.id }, data: { status: "POSTED" } });
  }

  const existingJournal = await prisma.journalEntry.findFirst({
    where: {
      tenantId,
      summary: { contains: `銷售確認 ${order.number}` },
      status: { not: "VOIDED" },
    },
    select: { id: true },
  });
  if (existingJournal) return { arCreated, journalCreated: false };

  const draft = await buildARCreatedDraft(order.id);
  await autoCreateJournal(tenantId, draft, userId);
  return { arCreated, journalCreated: true };
}

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("sales.view");
  const tenantId = await requireTenantId();
  const item = await prisma.salesOrder.findUnique({
    where: { id: params.id, tenantId },
    include: { customer: true, items: { include: { product: true } } },
  });
  return NextResponse.json(item);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("sales.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { action, warehouseId } = body;

  let response: Record<string, unknown> = { ok: true };

  if (action === "submit") {
    await requirePermission("sales.submit");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
    response = { ok: true, message: "已送出審核" };
  } else if (action === "confirm" || action === "approve") {
    await requirePermission("sales.approve");
    const order = await loadSalesOrderForAccounting(params.id, tenantId);
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
    const inventoryIssued = await ensureSalesInventoryIssued(order, tenantId);
    const { arCreated, journalCreated } = await ensureSalesReceivableAndJournal(order, tenantId, session.user.id, "DRAFT");
    response = {
      ok: true,
      autoCreated: arCreated || journalCreated || inventoryIssued,
      message: journalCreated
        ? "已自動建立應收帳款、銷貨傳票並扣減庫存"
        : "已審核，應收帳款與傳票已存在",
    };
  } else if (action === "reject") {
    await requirePermission("sales.reject");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("sales.post");
    const order = await loadSalesOrderForAccounting(params.id, tenantId);
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
    const inventoryIssued = await ensureSalesInventoryIssued(order, tenantId);
    const { arCreated, journalCreated } = await ensureSalesReceivableAndJournal(order, tenantId, session.user.id, "POSTED");
    response = {
      ok: true,
      autoCreated: arCreated || journalCreated || inventoryIssued,
      message: journalCreated ? "已過帳，並補建立應收帳款與銷貨傳票" : "已過帳，應收帳款已更新為已過帳",
    };
  } else if (action === "ship") {
    if (!warehouseId) throw new Error("請選擇出貨倉庫");
    await shipSalesOrder(params.id, warehouseId);
  } else if (action === "cancel") {
    await requirePermission("sales.void");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
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
  if (existing.status === "POSTED" || existing.status === "VOIDED") {
    throw new Error("已過帳/已作廢狀態無法修改");
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
  const canDelete = ["DRAFT", "VOIDED", "SUBMITTED", "APPROVED"].includes(o.status);
  if (!canDelete) throw new Error("已出貨/已付款狀態無法刪除");
  
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
