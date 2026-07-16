import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calculateInvoiceTotals } from "@/lib/invoice-totals";
import { allocateInvoiceTrackNumber } from "@/lib/invoice-numbering";
import { nextNumberInTransaction } from "@/lib/documents";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("invoices.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
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

  const totals = calculateInvoiceTotals(items);

  const effectiveInvoiceDate = invoiceDate ? new Date(invoiceDate) : new Date();
  const created = await prisma.$transaction(async (tx: any) => {
    let number = String(inNumber ?? "").trim().toUpperCase();
    if (!number) {
      const allocation = await allocateInvoiceTrackNumber(tx, { tenantId, type, invoiceDate: effectiveInvoiceDate, required: false });
      number = allocation?.invoiceNumber ?? await nextNumberInTransaction(tx, "INV", tenantId);
    }
    return tx.invoice.create({
      data: {
        tenantId,
        number,
        type,
        invoiceDate: effectiveInvoiceDate,
        customerId: type === "SALES" ? customerId : null,
        supplierId: type === "PURCHASE" ? supplierId : null,
        amountExTax: totals.amountExTax,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        remark,
        status: "POSTED",
        items: { create: totals.computed },
      },
      include: { items: true, customer: true, supplier: true },
    });
  });
  await audit({ userId: session.user.id, action: "create", module: "invoices", refId: created.id, detail: created.number });
  return NextResponse.json(created);
});
