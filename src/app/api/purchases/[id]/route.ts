import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { receivePurchaseOrder } from "@/lib/documents";
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
  const body = await req.json();
  const { action, warehouseId } = body;

  if (action === "submit") {
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED" } });
  } else if (action === "approve") {
    await requirePermission("purchases.approve");
    const order = await prisma.purchaseOrder.findUnique({ where: { id: params.id, tenantId } });
    if (!order) throw new Error("找不到採購單");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED" } });
    // 核准時自動建立應付帳款
    const existingAP = await prisma.accountsPayable.findFirst({ where: { purchaseOrderId: order.id, tenantId } });
    if (!existingAP) {
      await prisma.accountsPayable.create({
        data: {
          tenantId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          amount: order.total,
          status: "OPEN",
        },
      });
      // 自動建立傳票：借 存貨(進貨) / 貸 應付帳款
      const draft = await buildAPCreatedDraft(order.id);
      await autoCreateJournal(tenantId, draft, session.user.id);
    }
  } else if (action === "receive") {
    if (!warehouseId) throw new Error("請選擇入庫倉庫");
    await receivePurchaseOrder(params.id, warehouseId);
  } else if (action === "cancel") {
    await requirePermission("purchases.void");
    await prisma.purchaseOrder.update({ where: { id: params.id, tenantId }, data: { status: "CANCELLED" } });
  }
  await audit({ userId: session.user.id, action, module: "purchases", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("purchases.delete");
  const tenantId = await requireTenantId();
  const order = await prisma.purchaseOrder.findUnique({ where: { id: params.id, tenantId } });
  if (order?.status !== "DRAFT" && order?.status !== "CANCELLED") {
    throw new Error("僅草稿或已取消狀態可刪除");
  }
  await prisma.purchaseOrder.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "purchases", refId: params.id });
  return NextResponse.json({ ok: true });
});
