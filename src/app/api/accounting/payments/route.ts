import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("receivables.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") ?? "all"; // ar | ap | all
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const takeSize = kind === "all" ? Math.min(page * pageSize, 200) : pageSize;

  let receivePayments: any[] = [];
  let supplierPayments: any[] = [];
  let discountNotes: any[] = [];
  let totalReceive = 0;
  let totalSupplier = 0;
  let totalDiscount = 0;

  if (kind === "ar" || kind === "all") {
    const where: any = { tenantId };
    if (q) where.customer = { companyName: { contains: q, mode: "insensitive" } };
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) { const end = new Date(toDate); end.setHours(23, 59, 59, 999); where.createdAt.lte = end; }
    }
    [receivePayments, totalReceive] = await Promise.all([
      prisma.receivePayment.findMany({
        where,
        include: {
          customer: { select: { companyName: true } },
          receivable: { select: { salesOrder: { select: { number: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: kind === "all" ? 0 : (page - 1) * pageSize,
        take: takeSize,
      }),
      prisma.receivePayment.count({ where }),
    ]);
  }

  if (kind === "ap" || kind === "all") {
    const where: any = { tenantId };
    if (q) where.supplier = { companyName: { contains: q, mode: "insensitive" } };
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) { const end = new Date(toDate); end.setHours(23, 59, 59, 999); where.createdAt.lte = end; }
    }
    [supplierPayments, totalSupplier] = await Promise.all([
      prisma.supplierPayment.findMany({
        where,
        include: {
          supplier: { select: { companyName: true } },
          payable: { select: { purchaseOrder: { select: { number: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: kind === "all" ? 0 : (page - 1) * pageSize,
        take: takeSize,
      }),
      prisma.supplierPayment.count({ where }),
    ]);
  }

  // 折讓單
  const dnWhere: any = { tenantId };
  if (kind === "ar") dnWhere.type = "SALES";
  if (kind === "ap") dnWhere.type = "PURCHASE";
  if (q) {
    dnWhere.OR = [
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
      { supplier: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (fromDate || toDate) {
    dnWhere.createdAt = {};
    if (fromDate) dnWhere.createdAt.gte = new Date(fromDate);
    if (toDate) { const end = new Date(toDate); end.setHours(23, 59, 59, 999); dnWhere.createdAt.lte = end; }
  }
  [discountNotes, totalDiscount] = await Promise.all([
    prisma.discountNote.findMany({
      where: dnWhere,
      include: { customer: { select: { companyName: true } }, supplier: { select: { companyName: true } } },
      orderBy: { createdAt: "desc" },
      skip: kind === "all" ? 0 : (page - 1) * pageSize,
      take: takeSize,
    }),
    prisma.discountNote.count({ where: dnWhere }),
  ]);

  // 合併成統一格式
  const items = [
    ...receivePayments.map((p) => ({
      id: p.id,
      type: "收款" as const,
      number: p.number,
      party: p.customer?.companyName ?? "—",
      relNumber: p.receivable?.salesOrder?.number ?? "—",
      amount: Number(p.amount),
      method: p.method,
      date: p.paymentDate ?? p.createdAt,
      remark: p.remark,
    })),
    ...supplierPayments.map((p) => ({
      id: p.id,
      type: "付款" as const,
      number: p.number,
      party: p.supplier?.companyName ?? "—",
      relNumber: p.payable?.purchaseOrder?.number ?? "—",
      amount: Number(p.amount),
      method: p.method,
      date: p.paymentDate ?? p.createdAt,
      remark: p.remark,
    })),
    ...discountNotes.map((d) => ({
      id: d.id,
      type: "折讓" as const,
      number: d.number,
      party: (d.customer?.companyName ?? d.supplier?.companyName) ?? "—",
      relNumber: d.relNumber ?? "—",
      amount: Number(d.amount),
      method: d.type === "SALES" ? "銷售折讓" : "採購折讓",
      date: d.createdAt,
      remark: d.reason,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // 分頁
  const total = totalReceive + totalSupplier + totalDiscount;
  const paged = items.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ items: paged, total });
});
