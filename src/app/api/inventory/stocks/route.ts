import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("inventory.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";

  // 先確保所有商品在預設倉庫都有庫存記錄（同步商品管理）
  let defaultWh = await prisma.warehouse.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!defaultWh) {
    // 自動建立預設倉庫
    defaultWh = await prisma.warehouse.create({ data: { tenantId, code: "WH01", name: "預設倉庫", isActive: true } });
  }
  if (defaultWh) {
    // 取得所有商品 ID
    const allProducts = await prisma.product.findMany({
      where: { tenantId },
      select: { id: true },
    });
    // 取得已有庫存記錄的商品 ID
    const existingStocks = await prisma.inventoryStock.findMany({
      where: { tenantId, warehouseId: defaultWh.id },
      select: { productId: true },
    });
    const existingProductIds = new Set(existingStocks.map((s) => s.productId));
    // 找出缺少庫存記錄的商品
    const missingProducts = allProducts.filter((p) => !existingProductIds.has(p.id));
    if (missingProducts.length > 0) {
      await prisma.inventoryStock.createMany({
        data: missingProducts.map((p) => ({
          tenantId,
          productId: p.id,
          warehouseId: defaultWh.id,
          quantity: 0,
        })),
        skipDuplicates: true,
      });
    }
  }

  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { product: { sku: { contains: q, mode: "insensitive" } } },
      { product: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (fromDate || toDate) {
    where.updatedAt = {};
    if (fromDate) where.updatedAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.updatedAt.lte = end;
    }
  }
  
  const stocks = await prisma.inventoryStock.findMany({
    where,
    include: {
      product: { select: { sku: true, name: true, safetyStock: true, costPrice: true } },
      warehouse: { select: { name: true, code: true } },
    },
    orderBy: [{ warehouse: { code: "asc" } }, { product: { sku: "asc" } }],
  });
  
  return NextResponse.json({ items: stocks, total: stocks.length });
});
