import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildExcelWithImages, ServerExcelColumn } from "@/lib/excel-server";

// ExcelJS 與 Buffer 需要 Node.js runtime，不可使用 Edge Runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = {
  sku: string;
  name: string;
  spec: string | null;
  barcode: string | null;
  costPrice: any;
  salePrice: any;
  safetyStock: any;
  isActive: boolean;
  imageUrl: string | null;
  stockTotal: number;
};

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("products.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";

  const where: any = q
    ? {
        tenantId,
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
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

  const products = await prisma.product.findMany({
    where,
    select: {
      sku: true,
      name: true,
      spec: true,
      barcode: true,
      costPrice: true,
      salePrice: true,
      safetyStock: true,
      isActive: true,
      imageUrl: true,
      stocks: { select: { quantity: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: ProductRow[] = products.map((p: any) => ({
    sku: p.sku,
    name: p.name,
    spec: p.spec,
    barcode: p.barcode,
    costPrice: p.costPrice,
    salePrice: p.salePrice,
    safetyStock: p.safetyStock,
    isActive: p.isActive,
    imageUrl: p.imageUrl,
    stockTotal: p.stocks.reduce((s: number, x: any) => s + Number(x.quantity), 0),
  }));

  const columns: ServerExcelColumn<ProductRow>[] = [
    { header: "圖片", isImage: true, imageUrlGet: (r) => r.imageUrl, width: 14 },
    { header: "SKU", get: (r) => r.sku, width: 16 },
    { header: "商品名稱", get: (r) => r.name, width: 24 },
    { header: "規格", get: (r) => r.spec ?? "", width: 16 },
    { header: "條碼", get: (r) => r.barcode ?? "", width: 16 },
    { header: "成本", get: (r) => Number(r.costPrice), width: 12 },
    { header: "售價", get: (r) => Number(r.salePrice), width: 12 },
    { header: "安全庫存", get: (r) => Number(r.safetyStock), width: 12 },
    { header: "剩餘庫存", get: (r) => r.stockTotal, width: 12 },
    { header: "狀態", get: (r) => (r.isActive ? "啟用" : "停用"), width: 10 },
  ];

  const buffer = await buildExcelWithImages("商品管理", rows, columns);
  const filename = `商品管理-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
