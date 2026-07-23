import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolveDemoProductImage } from "@/lib/demo-product-media";
import { normalizeBusinessMode, productCatalogScope } from "@/lib/product-editions";

const ProductInput = z.object({
  sku: z.string().min(1),
  barcode: z.string().optional().nullable(),
  name: z.string().min(1),
  spec: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  costPrice: z.coerce.number().default(0),
  salePrice: z.coerce.number().default(0),
  safetyStock: z.coerce.number().default(0),
  taxRateId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isPublished: z.boolean().default(true),
  remark: z.string().optional().nullable(),
  stockQty: z.coerce.number().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("products.view");
  const tenantId = await requireTenantId(session);
  const businessMode = normalizeBusinessMode(session.user.businessMode);
  const useRetailFallback = businessMode === "POS_RETAIL";
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const warehouseId = sp.get("warehouseId") ?? "";
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = {
    tenantId,
    AND: [
      productCatalogScope(businessMode),
      ...(q ? [{
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
        ],
      }] : []),
    ],
  };
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
    prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        barcode: true,
        spec: true,
        costPrice: true,
        salePrice: true,
        safetyStock: true,
        isActive: true,
        isPublished: true,
        imageUrl: true,
        category: { select: { name: true } },
        unit: { select: { name: true } },
        stocks: {
          where: warehouseId ? { warehouseId } : undefined,
          select: { quantity: true },
        },
        taxRate: { select: { rate: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  const soldRows = items.length
    ? await prisma.salesOrderItem.groupBy({
        by: ["productId"],
        where: { productId: { in: items.map((p) => p.id) }, order: { tenantId } },
        _sum: { quantity: true },
      })
    : [];
  const soldByProduct = new Map(soldRows.map((row) => [row.productId, Number(row._sum.quantity ?? 0)]));
  return NextResponse.json({
    items: items.map((p: any) => {
      const stockTotal = p.stocks.reduce((s: number, x: any) => s + Number(x.quantity), 0);
      return {
        ...p,
        imageUrl: resolveDemoProductImage(p.sku, p.imageUrl, p.name, p.category?.name, useRetailFallback),
        stockTotal,
        soldTotal: soldByProduct.get(p.id) ?? 0,
      };
    }),
    total,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("products.create");
  const tenantId = await requireTenantId(session);
  const catalogMode = normalizeBusinessMode(session.user.businessMode);
  const currentUserId = await getCurrentUserId();
  const body = ProductInput.parse(await req.json());
  const normalizedBarcode = body.barcode?.trim() || null;
  const upsert = req.nextUrl.searchParams.get("upsert") === "1";
  const existingBySku = upsert
    ? null
    : await prisma.product.findUnique({
        where: { tenantId_sku: { tenantId, sku: body.sku } },
        select: { id: true, isArchived: true },
      });
  if (existingBySku && !existingBySku.isArchived) {
    throw new ApiError(409, `SKU ${body.sku} 已存在`);
  }
  if (normalizedBarcode) {
    const duplicate = await prisma.product.findFirst({
      where: {
        tenantId,
        barcode: normalizedBarcode,
        AND: [productCatalogScope(catalogMode)],
        ...(upsert ? { sku: { not: body.sku } } : existingBySku ? { id: { not: existingBySku.id } } : {}),
      },
      select: { sku: true, name: true },
    });
    if (duplicate) throw new ApiError(409, `條碼 ${normalizedBarcode} 已由 ${duplicate.sku} ${duplicate.name} 使用`);
  }
  if (upsert) {
    const { stockQty, ...productData } = body;
    const result = await prisma.product.upsert({
      where: { tenantId_sku: { tenantId, sku: body.sku } },
      update: { ...productData, barcode: normalizedBarcode, catalogMode, isArchived: false, updatedBy: currentUserId } as any,
      create: { ...productData, barcode: normalizedBarcode, tenantId, catalogMode, isArchived: false, updatedBy: currentUserId } as any,
    });
    // 庫存數量處理：導入時写入預設倉庫
    if (stockQty != null && stockQty >= 0) {
      const defaultWh = await prisma.warehouse.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" } });
      if (defaultWh) {
        await prisma.inventoryStock.upsert({
          where: { productId_warehouseId: { productId: result.id, warehouseId: defaultWh.id } },
          update: { quantity: stockQty },
          create: { tenantId, productId: result.id, warehouseId: defaultWh.id, quantity: stockQty },
        });
      }
    }
    await audit({ userId: session.user.id, action: "upsert", module: "products", refId: result.id, detail: result.sku });
    return NextResponse.json(result);
  }
  const { stockQty: _sq, ...createData } = body;
  const created = existingBySku
    ? await prisma.product.update({
        where: { id: existingBySku.id, tenantId },
        data: {
          ...createData,
          barcode: normalizedBarcode,
          catalogMode,
          isArchived: false,
          updatedBy: currentUserId,
        } as any,
      })
    : await prisma.product.create({
        data: {
          ...createData,
          barcode: normalizedBarcode,
          tenantId,
          catalogMode,
          isArchived: false,
          updatedBy: currentUserId,
        } as any,
      });
  // 自動在預設倉庫建立庫存記錄（數量 0），確保庫存管理頁面可見
  const defaultWh = await prisma.warehouse.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: "asc" } });
  if (defaultWh) {
    await prisma.inventoryStock.upsert({
      where: { productId_warehouseId: { productId: created.id, warehouseId: defaultWh.id } },
      update: {},
      create: { tenantId, productId: created.id, warehouseId: defaultWh.id, quantity: 0 },
    });
  }
  await audit({
    userId: session.user.id,
    action: existingBySku ? "restore" : "create",
    module: "products",
    refId: created.id,
    detail: created.sku,
  });
  return NextResponse.json(created);
});
