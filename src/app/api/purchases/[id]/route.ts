import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { receivePurchaseOrder } from "@/lib/documents";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("purchases.view");
  const item = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { supplier: true, items: { include: { product: true } } },
  });
  return NextResponse.json(item);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("purchases.edit");
  const body = await req.json();
  const { action, warehouseId } = body;

  if (action === "submit") {
    await prisma.purchaseOrder.update({ where: { id: params.id }, data: { status: "SUBMITTED" } });
  } else if (action === "approve") {
    await requirePermission("purchases.approve");
    await prisma.purchaseOrder.update({ where: { id: params.id }, data: { status: "APPROVED" } });
  } else if (action === "receive") {
    if (!warehouseId) throw new Error("請選擇入庫倉庫");
    await receivePurchaseOrder(params.id, warehouseId);
  } else if (action === "cancel") {
    await requirePermission("purchases.void");
    await prisma.purchaseOrder.update({ where: { id: params.id }, data: { status: "CANCELLED" } });
  }
  await audit({ userId: session.user.id, action, module: "purchases", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("purchases.delete");
  const order = await prisma.purchaseOrder.findUnique({ where: { id: params.id } });
  if (order?.status !== "DRAFT" && order?.status !== "CANCELLED") {
    throw new Error("僅草稿或已取消狀態可刪除");
  }
  await prisma.purchaseOrder.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "purchases", refId: params.id });
  return NextResponse.json({ ok: true });
});
