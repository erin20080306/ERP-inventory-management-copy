import { prisma } from "@/lib/prisma";

export async function getDashboardKpis(tenantId: string) {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    todaySales,
    monthSales,
    monthPurchase,
    arOpen,
    apOpen,
    inventoryValue,
    lowStockCount,
    unshipped,
    unpaidPO,
  ] = await Promise.all([
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, orderDate: { gte: startToday }, status: { not: "VOIDED" } },
    }),
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, orderDate: { gte: startMonth }, status: { not: "VOIDED" } },
    }),
    prisma.purchaseOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, orderDate: { gte: startMonth }, status: { not: "VOIDED" } },
    }),
    prisma.accountsReceivable.aggregate({ _sum: { amount: true, paidAmount: true }, where: { tenantId, status: { in: ["POSTED", "PARTIAL"] } } }),
    prisma.accountsPayable.aggregate({ _sum: { amount: true, paidAmount: true }, where: { tenantId, status: { in: ["POSTED", "PARTIAL"] } } }),
    (prisma.$queryRawUnsafe as any)(
      `SELECT COALESCE(SUM(s.quantity * p."costPrice"),0) as total FROM "InventoryStock" s JOIN "Product" p ON p.id = s."productId" WHERE s."tenantId" = $1`,
      tenantId
    ) as Promise<{ total: any }[]>,
    (prisma.$queryRawUnsafe as any)(
      `SELECT COUNT(*) as count
       FROM "Product" p
       WHERE p."tenantId" = $1
         AND p."isActive" = true
         AND COALESCE((SELECT SUM(s.quantity) FROM "InventoryStock" s WHERE s."productId" = p.id), 0) < p."safetyStock"`,
      tenantId
    ) as Promise<{ count: any }[]>,
    prisma.salesOrder.count({ where: { tenantId, status: { in: ["DRAFT", "SUBMITTED"] } } }),
    prisma.purchaseOrder.count({ where: { tenantId, status: { in: ["SUBMITTED", "APPROVED"] } } }),
  ]);

  return {
    todaySales: Number(todaySales._sum.total ?? 0),
    monthSales: Number(monthSales._sum.total ?? 0),
    monthPurchase: Number(monthPurchase._sum.total ?? 0),
    arTotal: Number(arOpen._sum.amount ?? 0) - Number(arOpen._sum.paidAmount ?? 0),
    apTotal: Number(apOpen._sum.amount ?? 0) - Number(apOpen._sum.paidAmount ?? 0),
    inventoryValue: Number(inventoryValue[0]?.total ?? 0),
    lowStockCount: Number(lowStockCount[0]?.count ?? 0),
    unshipped,
    unpaidPO,
  };
}

export async function getDashboardVisualStats(tenantId: string) {
  const [
    lowStock,
    recentSales,
    topProducts,
    salesByStatus,
    inventoryByWarehouse,
  ] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, isActive: true },
      include: { stocks: true },
      take: 100,
    }),
    prisma.salesOrder.findMany({
      where: { tenantId },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    }),
    prisma.$queryRawUnsafe(
      `SELECT i."productId", SUM(i.subtotal) as subtotal, SUM(i.quantity) as qty
       FROM "SalesOrderItem" i
       JOIN "SalesOrder" o ON o.id = i."orderId"
       WHERE o."tenantId" = $1
       GROUP BY i."productId" ORDER BY subtotal DESC LIMIT 5`,
      tenantId
    ) as any,
    prisma.salesOrder.groupBy({
      by: ["status"],
      _count: { id: true },
      where: { tenantId },
    }),
    (prisma.$queryRawUnsafe as any)(
      `SELECT w.name, COALESCE(SUM(s.quantity),0) as total FROM "InventoryStock" s JOIN "Warehouse" w ON w.id = s."warehouseId" WHERE s."tenantId" = $1 GROUP BY w.name`,
      tenantId
    ) as Promise<{ name: string; total: any }[]>,
  ]);

  const lowStockList = lowStock
    .map((p: any) => ({
      ...p,
      total: p.stocks.reduce((s: number, x: any) => s + Number(x.quantity), 0),
    }))
    .filter((p: any) => p.total < Number(p.safetyStock))
    .slice(0, 8);

  const productMap = topProducts.length
    ? await prisma.product.findMany({ where: { id: { in: topProducts.map((t: any) => t.productId) } } })
    : [];

  const start14 = new Date();
  start14.setDate(start14.getDate() - 13);
  start14.setHours(0, 0, 0, 0);
  const [dailySales, dailyPurchase] = await Promise.all([
    (prisma.$queryRawUnsafe as any)(
      `SELECT to_char("orderDate"::date, 'YYYY-MM-DD') as d, COALESCE(SUM(total),0) as total
       FROM "SalesOrder" WHERE "tenantId" = $1 AND "orderDate" >= $2 AND status <> 'VOIDED'
       GROUP BY 1 ORDER BY 1`,
      tenantId,
      start14
    ) as Promise<{ d: string; total: any }[]>,
    (prisma.$queryRawUnsafe as any)(
      `SELECT to_char("orderDate"::date, 'YYYY-MM-DD') as d, COALESCE(SUM(total),0) as total
       FROM "PurchaseOrder" WHERE "tenantId" = $1 AND "orderDate" >= $2 AND status <> 'VOIDED'
       GROUP BY 1 ORDER BY 1`,
      tenantId,
      start14
    ) as Promise<{ d: string; total: any }[]>,
  ]);

  const trendMap: Record<string, { date: string; sales: number; purchase: number }> = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(start14);
    d.setDate(start14.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    trendMap[k] = { date: k.slice(5), sales: 0, purchase: 0 };
  }
  dailySales.forEach((r: any) => {
    if (trendMap[r.d]) trendMap[r.d].sales = Number(r.total);
  });
  dailyPurchase.forEach((r: any) => {
    if (trendMap[r.d]) trendMap[r.d].purchase = Number(r.total);
  });

  return {
    lowStockList,
    recentSales,
    topProducts: topProducts.map((t: any) => ({
      name: productMap.find((p: any) => p.id === t.productId)?.name ?? "-",
      subtotal: Number(t.subtotal ?? t._sum?.subtotal ?? 0),
      qty: Number(t.qty ?? t._sum?.quantity ?? 0),
    })),
    trend: Object.values(trendMap),
    salesByStatus: salesByStatus.map((s: any) => ({
      name: s.status === "DRAFT" ? "草稿" : s.status === "SUBMITTED" ? "已送審" : s.status === "APPROVED" ? "已審核" : s.status === "POSTED" ? "已過帳" : s.status === "VOIDED" ? "已作廢" : s.status,
      value: s._count.id,
    })),
    inventoryByWarehouse: inventoryByWarehouse.map((w: any) => ({
      name: w.name,
      value: Number(w.total),
    })),
  };
}
