import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { receivePurchaseOrder, calcTotals } from "@/lib/documents";
import { buildAPCreatedDraft, autoCreateJournal } from "@/lib/auto-journal";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("purchases.view");
  const tenantId = await requireTenantId();
  const item = await prisma.purchaseOrder.findUnique({
    where: { id: params.id, tenantId },
    include: { supplier: true, items: { include: { product: true } } },
  });
  return NextResponse.json(item);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("purchases.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { action, warehouseId } = body;

  if (action === "submit") {
    await requirePermission("purchases.submit");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
  } else if (action === "approve") {
    await requirePermission("purchases.approve");
    const order = await prisma.purchaseOrder.findUnique({ where: { id: params.id, tenantId }, include: { items: true } });
    if (!order) throw new Error("找不到採購單");
    // 核准時自動入庫到預設倉庫
    const defaultWh = await prisma.warehouse.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: "asc" } });
    if (defaultWh) {
      for (const item of order.items) {
        await prisma.inventoryStock.upsert({
          where: { productId_warehouseId: { productId: item.productId, warehouseId: defaultWh.id } },
          update: { quantity: { increment: item.quantity } },
          create: { tenantId, productId: item.productId, warehouseId: defaultWh.id, quantity: item.quantity },
        });
        await prisma.inventoryTransaction.create({
          data: { tenantId, productId: item.productId, warehouseId: defaultWh.id, type: "PURCHASE_IN", quantity: item.quantity, unitCost: item.unitPrice, refType: "PURCHASE", refId: order.id, remark: `採購核准入庫 ${order.number}` },
        });
      }
    }
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
    // 核准時自動建立應付帳款
    const existingAP = await prisma.accountsPayable.findFirst({ where: { purchaseOrderId: order.id, tenantId } });
    if (!existingAP) {
      await prisma.accountsPayable.create({
        data: {
          tenantId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          amount: order.total,
          status: "DRAFT",
        },
      });
      // 自動建立傳票：借 存貨(進貨) / 貸 應付帳款
      const draft = await buildAPCreatedDraft(order.id);
      await autoCreateJournal(tenantId, draft, session.user.id);
      return NextResponse.json({ ok: true, message: "已自動建立應付帳款與傳票，庫存已增加" });
    }
  } else if (action === "reject") {
    await requirePermission("purchases.reject");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("purchases.post");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
  } else if (action === "receive") {
    if (!warehouseId) throw new Error("請選擇入庫倉庫");
    await receivePurchaseOrder(params.id, warehouseId);
  } else if (action === "cancel") {
    await requirePermission("purchases.void");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
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
  if (["POSTED", "VOIDED"].includes(existing.status)) {
    throw new Error("已過帳/已作廢狀態無法修改");
  }
  const body = await req.json();
  const { supplierId, items, remark } = body as any;
  if (!supplierId) throw new Error("請選擇供應商");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items);
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
      updatedBy: currentUserId,
      items: {
        create: totals.computed.map((i: any) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount ?? 0,
          taxRate: i.taxRate ?? 0,
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
  const canDelete = ["DRAFT", "VOIDED", "SUBMITTED", "APPROVED"].includes(order.status);
  if (!canDelete) throw new Error("已入庫/已付款狀態無法刪除");
  await prisma.accountsPayable.deleteMany({ where: { purchaseOrderId: params.id, tenantId } });
  await prisma.purchaseOrder.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "purchases", refId: params.id });
  return NextResponse.json({ ok: true });
});
