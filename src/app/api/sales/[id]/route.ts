import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { shipSalesOrder } from "@/lib/documents";
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
  const body = await req.json();
  const { action, warehouseId } = body;

  if (action === "submit" || action === "confirm") {
    const order = await prisma.salesOrder.findUnique({ where: { id: params.id, tenantId } });
    if (!order) throw new Error("找不到銷售單");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "CONFIRMED" } });
    // 確認時自動建立應收帳款
    const existingAR = await prisma.accountsReceivable.findFirst({ where: { salesOrderId: order.id, tenantId } });
    if (!existingAR) {
      await prisma.accountsReceivable.create({
        data: {
          tenantId,
          customerId: order.customerId,
          salesOrderId: order.id,
          amount: order.total,
          status: "OPEN",
        },
      });
      // 自動建立傳票：借 應收帳款 / 貸 銷貨收入
      const draft = await buildARCreatedDraft(order.id);
      await autoCreateJournal(tenantId, draft, session.user.id);
    }
  } else if (action === "ship") {
    if (!warehouseId) throw new Error("請選擇出貨倉庫");
    await shipSalesOrder(params.id, warehouseId);
  } else if (action === "cancel") {
    await requirePermission("sales.void");
    await prisma.salesOrder.update({ where: { id: params.id, tenantId }, data: { status: "CANCELLED" } });
  }
  await audit({ userId: session.user.id, action, module: "sales", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("sales.delete");
  const tenantId = await requireTenantId();
  const o = await prisma.salesOrder.findUnique({ where: { id: params.id, tenantId } });
  if (o?.status !== "DRAFT" && o?.status !== "CANCELLED") throw new Error("僅草稿或已取消狀態可刪除");
  await prisma.salesOrder.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "sales", refId: params.id });
  return NextResponse.json({ ok: true });
});
