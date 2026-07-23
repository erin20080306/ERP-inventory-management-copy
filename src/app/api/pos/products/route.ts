import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { resolveDemoProductImage } from "@/lib/demo-product-media";
import { prisma } from "@/lib/prisma";

function serializeProduct(product: any) {
  return {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    spec: product.spec,
    salePrice: Number(product.salePrice),
    imageUrl: resolveDemoProductImage(product.sku, product.imageUrl),
    categoryName: product.category?.name ?? "未分類",
    stockTotal: product.stocks.reduce((sum: number, stock: any) => sum + Number(stock.quantity), 0),
  };
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const warehouseId = (req.nextUrl.searchParams.get("warehouseId") ?? "").trim();
  const scan = (req.nextUrl.searchParams.get("scan") ?? "").trim();
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 200);

  if (!warehouseId) throw new ApiError(400, "缺少門市倉庫");
  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, isActive: true }, select: { id: true } });
  if (!warehouse) throw new ApiError(404, "找不到可用門市倉庫");

  const select = {
    id: true,
    sku: true,
    barcode: true,
    name: true,
    spec: true,
    salePrice: true,
    imageUrl: true,
    category: { select: { name: true } },
    stocks: { where: { warehouseId }, select: { quantity: true } },
  } as const;

  if (scan) {
    const matches = await prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { sku: { equals: scan, mode: "insensitive" } },
          { barcode: { equals: scan, mode: "insensitive" } },
        ],
      },
      select,
      take: 2,
    });
    if (matches.length === 0) throw new ApiError(404, `找不到條碼或貨號：${scan}`);
    if (matches.length > 1) throw new ApiError(409, `條碼或貨號 ${scan} 對應多個商品，請先修正商品主檔`);
    return NextResponse.json({ exact: serializeProduct(matches[0]) });
  }

  const products = await prisma.product.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(query ? {
        OR: [
          { sku: { contains: query, mode: "insensitive" as const } },
          { barcode: { contains: query, mode: "insensitive" as const } },
          { name: { contains: query, mode: "insensitive" as const } },
          { spec: { contains: query, mode: "insensitive" as const } },
        ],
      } : {}),
      ...(ids.length ? { id: { in: ids } } : {}),
    },
    select,
    orderBy: [{ name: "asc" }, { sku: "asc" }],
    take: query ? 80 : 500,
  });
  return NextResponse.json({ items: products.map(serializeProduct) }, { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" } });
});
