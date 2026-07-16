import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("returns.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = q
    ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { companyName: { contains: q, mode: "insensitive" } } }] }
    : { tenantId };
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  const [items, total] = await Promise.all([
    prisma.salesReturn.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salesReturn.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("returns.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { customerId, salesOrderId, reason, status, items, isTaxable } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items, isTaxable !== false);
  const number = await nextNumber("SR", tenantId);

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.salesReturn.create({
      data: {
        tenantId,
        number,
        customerId,
        salesOrderId,
        reason,
        status: status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
        returnDate: new Date(),
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

    return ret;
  });

  await audit({ userId: session.user.id, action: "create", module: "returns", refId: created.id, detail: number });

  return NextResponse.json(created);
});

export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("returns.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { id, action } = body as any;
  const existing = await prisma.salesReturn.findUnique({ where: { id, tenantId } });
  if (!existing) throw new Error("退貨單不存在");

  if (action === "submit") {
    await requirePermission("returns.submit");
    if (!["DRAFT", "REJECTED"].includes(existing.status)) throw new Error("只有草稿或退回單據可以送審");
    await prisma.salesReturn.update({ where: { id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
  } else if (action === "approve") {
    await requirePermission("returns.approve");
    if (existing.status !== "SUBMITTED") throw new Error("只有已送審退貨單可以核准");
    await prisma.salesReturn.update({ where: { id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
  } else if (action === "reject") {
    await requirePermission("returns.reject");
    if (existing.status !== "SUBMITTED") throw new Error("只有已送審退貨單可以退回");
    await prisma.salesReturn.update({ where: { id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("returns.post");
    if (existing.status !== "APPROVED") throw new Error("只有已核准退貨單可以過帳");
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-return:${tenantId}:${id}`}))`;
      const ret = await tx.salesReturn.findFirst({ where: { id, tenantId, status: "APPROVED" }, include: { items: true, salesOrder: { include: { items: true } } } });
      if (!ret) throw new Error("退貨單已由其他人員處理，請重新整理");
      if (!ret?.salesOrder || ret.salesOrder.status !== "POSTED" || !ret.salesOrder.warehouseId) throw new Error("退貨單必須關聯已出貨銷售單與原出貨倉庫");
      if (ret.customerId !== ret.salesOrder.customerId) throw new Error("退貨客戶與原銷售單不一致");
      const source = new Map(ret.salesOrder.items.map((item) => [item.productId, Number(item.shippedQty)]));
      const prior = await tx.salesReturnItem.groupBy({ by: ["productId"], where: { return: { salesOrderId: ret.salesOrderId, status: "POSTED" } }, _sum: { quantity: true } });
      const priorMap = new Map(prior.map((row) => [row.productId, Number(row._sum.quantity ?? 0)]));
      for (const item of ret.items) {
        if (Number(item.quantity) + (priorMap.get(item.productId) ?? 0) > (source.get(item.productId) ?? 0)) throw new Error("退貨數量不可超過原出貨數量");
        await tx.inventoryStock.upsert({ where: { productId_warehouseId: { productId: item.productId, warehouseId: ret.salesOrder.warehouseId } }, update: { quantity: { increment: item.quantity } }, create: { tenantId, productId: item.productId, warehouseId: ret.salesOrder.warehouseId, quantity: item.quantity } });
        await tx.inventoryTransaction.create({ data: { tenantId, productId: item.productId, warehouseId: ret.salesOrder.warehouseId, type: "SALES_RETURN_IN", quantity: item.quantity, refType: "SALES_RETURN", refId: ret.id, remark: `銷貨退回 ${ret.number}` } });
      }
      await tx.accountsReceivable.create({ data: { tenantId, customerId: ret.customerId, salesOrderId: ret.salesOrderId, amount: Number(ret.total) * -1, status: "POSTED", updatedBy: currentUserId } });
      await tx.salesReturn.update({ where: { id: ret.id }, data: { status: "POSTED", updatedBy: currentUserId } });
    }, { isolationLevel: "ReadCommitted" });
  } else if (action === "void") {
    await requirePermission("returns.void");
    if (existing.status === "POSTED") throw new Error("已過帳退貨必須建立沖銷單，不可直接作廢");
    await prisma.salesReturn.update({ where: { id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
  } else {
    throw new Error("不支援的退貨動作");
  }

  await audit({ userId: session.user.id, action, module: "returns", refId: id });
  return NextResponse.json({ ok: true });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("returns.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { id, customerId, salesOrderId, reason, items, isTaxable } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items, isTaxable !== false);

  const existing = await prisma.salesReturn.findUnique({ where: { id, tenantId } });
  if (!existing) throw new Error("退貨單不存在");
  if (!["DRAFT", "REJECTED"].includes(existing.status)) throw new Error("只有草稿或退回單據可以修改");

  const updated = await prisma.salesReturn.update({
    where: { id, tenantId },
    data: {
      customerId,
      salesOrderId,
      reason,
      status: existing.status,
      total: totals.total,
      isTaxable: isTaxable !== false,
      updatedBy: currentUserId,
      items: {
        deleteMany: {},
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

  await audit({ userId: session.user.id, action: "update", module: "returns", refId: id, detail: existing.number });

  return NextResponse.json(updated);
});
