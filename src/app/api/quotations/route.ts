import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
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
    include: { items: true, customer: true },
  });

  await audit({ userId: session.user.id, action: "create", module: "quotations", refId: created.id, detail: number });

  return NextResponse.json(created);
});

export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("quotations.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { id, status } = body as any;
  
  const updated = await prisma.quotation.update({
    where: { id, tenantId },
    data: { status },
  });

  await audit({ userId: session.user.id, action: "update", module: "quotations", refId: id, detail: `狀態: ${status}` });

  return NextResponse.json(updated);
});
