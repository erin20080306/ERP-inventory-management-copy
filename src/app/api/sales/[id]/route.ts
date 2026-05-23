import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { shipSalesOrder, calcTotals } from "@/lib/documents";
import { buildARCreatedDraft, autoCreateJournal } from "@/lib/auto-journal";

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

  if (action === "submit" || action === "confirm") {
    if (action === "submit") await requirePermission("sales.submit");
    const order = await prisma.salesOrder.findUnique({ where: { id: params.id, tenantId }, include: { items: true } });
    if (!order) throw new Error("找不到銷售單");
    // 確認時自動從預設倉庫扣減庫存
    const defaultWh = await prisma.warehouse.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: "asc" } });
    if (defaultWh) {
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
          data: { tenantId, productId: item.productId, warehouseId: defaultWh.id, type: "SALES_OUT", quantity: Number(item.quantity) * -1, unitCost: item.unitPrice, refType: "SALES", refId: order.id, remark: `銷售確認出庫 ${order.number}` },
        });
      }
    }
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
    // 確認時自動建立應收帳款
    const existingAR = await prisma.accountsReceivable.findFirst({ where: { salesOrderId: order.id, tenantId } });
    if (!existingAR) {
      await prisma.accountsReceivable.create({
        data: {
          tenantId,
          customerId: order.customerId,
          salesOrderId: order.id,
          amount: order.total,
          status: "DRAFT",
        },
      });
      // 自動建立傳票：借 應收帳款 / 貸 銷貨收入
      const draft = await buildARCreatedDraft(order.id);
      await autoCreateJournal(tenantId, draft, session.user.id);
      return NextResponse.json({ ok: true, message: "已自動建立應收帳款與傳票，庫存已扣減" });
    }
  } else if (action === "approve") {
    await requirePermission("sales.approve");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
  } else if (action === "reject") {
    await requirePermission("sales.reject");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("sales.post");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
  } else if (action === "ship") {
    if (!warehouseId) throw new Error("請選擇出貨倉庫");
    await shipSalesOrder(params.id, warehouseId);
  } else if (action === "cancel") {
    await requirePermission("sales.void");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
  }
  await audit({ userId: session.user.id, action, module: "sales", refId: params.id });
  return NextResponse.json({ ok: true });
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
  // 刪除關聯的 AR
  await prisma.accountsReceivable.deleteMany({ where: { salesOrderId: params.id, tenantId } });
  await prisma.salesOrder.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "sales", refId: params.id });
  return NextResponse.json({ ok: true });
});
