import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("quotations.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  
  const where: any = q
    ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { companyName: { contains: q, mode: "insensitive" } } }] }
    : { tenantId };
  
  if (fromDate || toDate) {
    where.quoteDate = {};
    if (fromDate) where.quoteDate.gte = new Date(fromDate);
    if (toDate) where.quoteDate.lte = new Date(toDate);
  }
  
  const [items, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.quotation.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("quotations.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { customerId, quoteDate, validUntil, reason, status, items } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items);
  const number = await nextNumber("QT", tenantId);

  const created = await prisma.quotation.create({
    data: {
      tenantId,
      number,
      customerId,
      quoteDate: quoteDate ? new Date(quoteDate) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      status: status ?? "DRAFT",
      total: totals.total,
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

  await audit({ userId: session.user.id, action: "create", module: "quotations", refId: created.id, detail: number });

  return NextResponse.json(created);
});

export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("quotations.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { id, status, action } = body as any;

  if (action) {
    if (action === "submit") {
      await requirePermission("quotations.submit");
      await prisma.quotation.update({ where: { id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
    } else if (action === "approve") {
      await requirePermission("quotations.approve");
      await prisma.quotation.update({ where: { id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
    } else if (action === "reject") {
      await requirePermission("quotations.reject");
      await prisma.quotation.update({ where: { id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
    } else if (action === "post") {
      await requirePermission("quotations.post");
      await prisma.quotation.update({ where: { id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
    } else if (action === "void") {
      await requirePermission("quotations.void");
      await prisma.quotation.update({ where: { id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
    }
    await audit({ userId: session.user.id, action, module: "quotations", refId: id });
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.quotation.update({
    where: { id, tenantId },
    data: { status, updatedBy: currentUserId },
  });

  await audit({ userId: session.user.id, action: "update", module: "quotations", refId: id, detail: `狀態: ${status}` });

  return NextResponse.json(updated);
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("quotations.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { id, customerId, quoteDate, validUntil, status, items } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items);

  const existing = await prisma.quotation.findUnique({ where: { id, tenantId } });
  if (!existing) throw new Error("報價單不存在");

  const updated = await prisma.quotation.update({
    where: { id, tenantId },
    data: {
      customerId,
      quoteDate: quoteDate ? new Date(quoteDate) : existing.quoteDate,
      validUntil: validUntil ? new Date(validUntil) : null,
      status: status ?? existing.status,
      total: totals.total,
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

  await audit({ userId: session.user.id, action: "update", module: "quotations", refId: id, detail: existing.number });

  return NextResponse.json(updated);
});
