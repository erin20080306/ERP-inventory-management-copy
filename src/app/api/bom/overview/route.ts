import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const MODULE_PERMISSIONS: Record<string, string> = {
  products: "products.view",
  customers: "customers.view",
  suppliers: "suppliers.view",
  purchases: "purchases.view",
  sales: "sales.view",
  quotations: "quotations.view",
  accounts: "accounting.view",
  journals: "journals.view",
  receivables: "receivables.view",
  payables: "payables.view",
  "notes-receivable": "notes.view",
  "notes-payable": "notes.view",
  invoices: "invoices.view",
  "fixed-assets": "assets.view",
  employees: "hr.view",
  departments: "hr.view",
};

function positiveInt(value: string | null, fallback: number) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function applyDateRange(where: any, field: string, fromDate: string, toDate: string) {
  if (!fromDate && !toDate) return;
  where[field] = {};
  if (fromDate) where[field].gte = new Date(fromDate);
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    where[field].lte = end;
  }
}

async function jsonPage(itemsPromise: Promise<any[]>, totalPromise: Promise<number>, map?: (item: any) => any) {
  const [items, total] = await Promise.all([itemsPromise, totalPromise]);
  return NextResponse.json({ items: map ? items.map(map) : items, total });
}

export const GET = apiHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const moduleKey = sp.get("module") ?? "products";
  const permission = MODULE_PERMISSIONS[moduleKey];
  if (!permission) throw new ApiError(400, "不支援的 BOM 模組");

  const session = await requirePermission(permission);
  const tenantId = await requireTenantId(session);
  const q = sp.get("q")?.trim() ?? "";
  const page = positiveInt(sp.get("page"), 1);
  const pageSize = Math.min(positiveInt(sp.get("pageSize"), 50), 200);
  const skip = (page - 1) * pageSize;
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";

  if (moduleKey === "products") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.product.findMany({
        where,
        select: {
          id: true,
          sku: true,
          name: true,
          spec: true,
          costPrice: true,
          salePrice: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where })
    );
  }

  if (moduleKey === "customers") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
        { taxId: { contains: q } },
        { phone: { contains: q } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          code: true,
          companyName: true,
          contactName: true,
          phone: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.customer.count({ where })
    );
  }

  if (moduleKey === "suppliers") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
        { taxId: { contains: q } },
        { phone: { contains: q } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.supplier.findMany({
        where,
        select: {
          id: true,
          code: true,
          companyName: true,
          contactName: true,
          phone: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.supplier.count({ where })
    );
  }

  if (moduleKey === "purchases") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { supplier: { companyName: { contains: q, mode: "insensitive" } } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.purchaseOrder.findMany({
        where,
        select: {
          id: true,
          number: true,
          supplier: { select: { companyName: true } },
          total: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.purchaseOrder.count({ where })
    );
  }

  if (moduleKey === "sales") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { companyName: { contains: q, mode: "insensitive" } } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.salesOrder.findMany({
        where,
        select: {
          id: true,
          number: true,
          customer: { select: { companyName: true } },
          total: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.salesOrder.count({ where })
    );
  }

  if (moduleKey === "quotations") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { companyName: { contains: q, mode: "insensitive" } } },
      ];
    }
    applyDateRange(where, "quoteDate", fromDate, toDate);
    return jsonPage(
      prisma.quotation.findMany({
        where,
        select: {
          id: true,
          number: true,
          customer: { select: { companyName: true } },
          total: true,
          status: true,
          quoteDate: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.quotation.count({ where })
    );
  }

  if (moduleKey === "accounts") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.chartOfAccount.findMany({
        where,
        select: { id: true, code: true, name: true, type: true, createdAt: true },
        orderBy: { code: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.chartOfAccount.count({ where })
    );
  }

  if (moduleKey === "journals") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
      ];
    }
    applyDateRange(where, "entryDate", fromDate, toDate);
    return jsonPage(
      prisma.journalEntry.findMany({
        where,
        select: { id: true, number: true, summary: true, entryDate: true, status: true },
        orderBy: { entryDate: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.journalEntry.count({ where })
    );
  }

  if (moduleKey === "receivables") {
    const where: any = { tenantId };
    if (q) where.customer = { companyName: { contains: q, mode: "insensitive" } };
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.accountsReceivable.findMany({
        where,
        select: {
          id: true,
          customer: { select: { companyName: true } },
          amount: true,
          paidAmount: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.accountsReceivable.count({ where })
    );
  }

  if (moduleKey === "payables") {
    const where: any = { tenantId };
    if (q) where.supplier = { companyName: { contains: q, mode: "insensitive" } };
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.accountsPayable.findMany({
        where,
        select: {
          id: true,
          supplier: { select: { companyName: true } },
          amount: true,
          paidAmount: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.accountsPayable.count({ where })
    );
  }

  if (moduleKey === "notes-receivable") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { noteNumber: { contains: q, mode: "insensitive" } },
        { customer: { companyName: { contains: q, mode: "insensitive" } } },
        { bankName: { contains: q, mode: "insensitive" } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.noteReceivable.findMany({
        where,
        select: {
          id: true,
          noteNumber: true,
          customer: { select: { companyName: true } },
          amount: true,
          dueDate: true,
          status: true,
        },
        orderBy: { dueDate: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.noteReceivable.count({ where })
    );
  }

  if (moduleKey === "notes-payable") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { noteNumber: { contains: q, mode: "insensitive" } },
        { supplier: { companyName: { contains: q, mode: "insensitive" } } },
        { payeeName: { contains: q, mode: "insensitive" } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.notePayable.findMany({
        where,
        select: {
          id: true,
          noteNumber: true,
          supplier: { select: { companyName: true } },
          amount: true,
          dueDate: true,
          status: true,
        },
        orderBy: { dueDate: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.notePayable.count({ where })
    );
  }

  if (moduleKey === "invoices") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { companyName: { contains: q, mode: "insensitive" } } },
        { supplier: { companyName: { contains: q, mode: "insensitive" } } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.invoice.findMany({
        where,
        select: { id: true, number: true, type: true, totalAmount: true, status: true, invoiceDate: true },
        orderBy: { invoiceDate: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.invoice.count({ where })
    );
  }

  if (moduleKey === "fixed-assets") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { serialNumber: { contains: q, mode: "insensitive" } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.fixedAsset.findMany({
        where,
        select: { id: true, code: true, name: true, acquireCost: true, status: true, createdAt: true },
        orderBy: { acquireDate: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.fixedAsset.count({ where }),
      ({ acquireCost, ...asset }) => ({ ...asset, cost: acquireCost })
    );
  }

  if (moduleKey === "employees") {
    const where: any = { tenantId };
    if (q) {
      where.OR = [
        { employeeNo: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { idNumber: { contains: q } },
      ];
    }
    applyDateRange(where, "createdAt", fromDate, toDate);
    return jsonPage(
      prisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeNo: true,
          name: true,
          department: { select: { name: true } },
          status: true,
          createdAt: true,
        },
        orderBy: { employeeNo: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.employee.count({ where })
    );
  }

  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  applyDateRange(where, "createdAt", fromDate, toDate);
  return jsonPage(
    prisma.department.findMany({
      where,
      select: { id: true, code: true, name: true, isActive: true, createdAt: true },
      orderBy: { code: "asc" },
      skip,
      take: pageSize,
    }),
    prisma.department.count({ where })
  );
});
