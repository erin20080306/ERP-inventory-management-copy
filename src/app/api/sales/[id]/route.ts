import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { shipSalesOrder } from "@/lib/documents";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("sales.view");
  const item = await prisma.salesOrder.findUnique({
    where: { id: params.id },
    include: { customer: true, items: { include: { product: true } } },
  });
  return NextResponse.json(item);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("sales.edit");
  const body = await req.json();
  const { action, warehouseId } = body;

  if (action === "submit" || action === "confirm") {
    await prisma.salesOrder.update({ where: { id: params.id }, data: { status: "CONFIRMED" } });
  } else if (action === "ship") {
    if (!warehouseId) throw new Error("請選擇出貨倉庫");
    await shipSalesOrder(params.id, warehouseId);
  } else if (action === "cancel") {
    await requirePermission("sales.void");
    await prisma.salesOrder.update({ where: { id: params.id }, data: { status: "CANCELLED" } });
  }
  await audit({ userId: session.user.id, action, module: "sales", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("sales.delete");
  const o = await prisma.salesOrder.findUnique({ where: { id: params.id } });
  if (o?.status !== "DRAFT" && o?.status !== "CANCELLED") throw new Error("僅草稿或已取消狀態可刪除");
  await prisma.salesOrder.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "sales", refId: params.id });
  return NextResponse.json({ ok: true });
});
