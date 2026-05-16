import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("invoices.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q
    ? {
        tenantId,
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { customer: { companyName: { contains: q, mode: "insensitive" } } },
          { supplier: { companyName: { contains: q, mode: "insensitive" } } },
        ],
      }
    : { tenantId };
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { customer: true, supplier: true, items: true },
      orderBy: { invoiceDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("invoices.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { type, customerId, supplierId, invoiceDate, number: inNumber, items, remark } = body as any;

  if (!type || !["SALES", "PURCHASE"].includes(type)) throw new Error("請指定發票類型 (銷項/進項)");
  if (type === "SALES" && !customerId) throw new Error("銷項發票必須選擇客戶");
  if (type === "PURCHASE" && !supplierId) throw new Error("進項發票必須選擇供應商");
  if (!items?.length) throw new Error("請至少新增一項明細");

  let amountExTax = 0;
  let taxAmount = 0;
  const computed = items.map((i: any) => {
    const line = Number(i.quantity) * Number(i.unitPrice);
    const tax = line * Number(i.taxRate ?? 0);
    amountExTax += line;
    taxAmount += tax;
    return {
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      taxRate: Number(i.taxRate ?? 0),
      subtotal: +line.toFixed(2),
    };
  });
  const totalAmount = +(amountExTax + taxAmount).toFixed(2);
  const number = inNumber || (await nextNumber("INV", tenantId));

  const created = await prisma.invoice.create({
    data: {
      tenantId,
      number,
      type,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      customerId: type === "SALES" ? customerId : null,
      supplierId: type === "PURCHASE" ? supplierId : null,
      amountExTax: +amountExTax.toFixed(2),
      taxAmount: +taxAmount.toFixed(2),
      totalAmount,
      remark,
      status: "ISSUED",
      items: { create: computed },
    },
    include: { items: true, customer: true, supplier: true },
  });
  await audit({ userId: session.user.id, action: "create", module: "invoices", refId: created.id, detail: number });
  return NextResponse.json(created);
});
