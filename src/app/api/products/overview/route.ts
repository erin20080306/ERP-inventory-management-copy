import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";

  const where: any = q
    ? { tenantId, OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
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

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: true,
        unit: true,
        stocks: { include: { warehouse: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  // 取得每個商品的銷售/採購統計
  const productIds = products.map(p => p.id);
  const [salesStats, purchaseStats] = await Promise.all([
    prisma.salesOrderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds } },
      _sum: { quantity: true, subtotal: true },
    }),
    prisma.purchaseOrderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds } },
      _sum: { quantity: true, subtotal: true },
    }),
  ]);

  const salesMap = Object.fromEntries(salesStats.map((s: any) => [s.productId, s._sum]));
  const purchaseMap = Object.fromEntries(purchaseStats.map((p: any) => [p.productId, p._sum]));

  const items = products.map((p: any) => {
    const totalStock = p.stocks.reduce((s: number, stock: any) => s + Number(stock.quantity), 0);
    const stockByWarehouse = p.stocks.map((s: any) => ({
      warehouse: s.warehouse.name,
      quantity: Number(s.quantity),
    }));

    const sales = salesMap[p.id] || { quantity: 0, subtotal: 0 };
    const purchases = purchaseMap[p.id] || { quantity: 0, subtotal: 0 };
    
    // 計算毛利
    const totalSalesAmount = Number(sales.subtotal || 0);
    const totalCostAmount = Number(sales.quantity || 0) * Number(p.costPrice || 0);
    const grossProfit = totalSalesAmount - totalCostAmount;
    const grossMargin = totalSalesAmount > 0 ? (grossProfit / totalSalesAmount) * 100 : 0;

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      spec: p.spec,
      barcode: p.barcode,
      costPrice: p.costPrice,
      salePrice: p.salePrice,
      safetyStock: p.safetyStock,
      category: p.category?.name,
      unit: p.unit?.name,
      totalStock,
      stockByWarehouse,
      salesQuantity: Number(sales.quantity || 0),
      salesAmount: totalSalesAmount,
      purchaseQuantity: Number(purchases.quantity || 0),
      purchaseAmount: Number(purchases.subtotal || 0),
      grossProfit,
      grossMargin,
      isActive: p.isActive,
    };
  });

  return NextResponse.json({ items, total });
});
