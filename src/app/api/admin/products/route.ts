import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { BUSINESS_MODES, normalizeBusinessMode } from "@/lib/product-editions";

const CATALOGS = new Set<string>(BUSINESS_MODES);

const ProductInput = z.object({
  tenantId: z.string().min(1),
  catalogMode: z.string().refine((value) => CATALOGS.has(value), "商品目錄類型不正確"),
  sku: z.string().trim().min(1).max(100),
  barcode: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(1).max(200),
  spec: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  imageUrl: z.string().trim().max(2000).optional().nullable(),
  costPrice: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).default(0),
  safetyStock: z.coerce.number().min(0).default(0),
  stockQty: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
  isPublished: z.boolean().default(true),
  remark: z.string().trim().max(1000).optional().nullable(),
});

async function requirePlatformAdmin() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限平台超級管理員");
  return session;
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePlatformAdmin();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(sp.get("pageSize") || 30)));
  const q = (sp.get("q") || "").trim();
  const tenantId = (sp.get("tenantId") || "").trim();
  const catalog = (sp.get("catalog") || "").trim();

  const where: any = {
    isArchived: false,
    ...(tenantId ? { tenantId } : {}),
    ...(CATALOGS.has(catalog) ? { catalogMode: catalog } : {}),
    ...(q ? {
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        { tenant: { name: { contains: q, mode: "insensitive" } } },
      ],
    } : {}),
  };

  const [items, total, tenants] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        catalogMode: true,
        sku: true,
        barcode: true,
        name: true,
        spec: true,
        description: true,
        imageUrl: true,
        costPrice: true,
        salePrice: true,
        safetyStock: true,
        isActive: true,
        isPublished: true,
        remark: true,
        updatedAt: true,
        tenant: { select: { name: true, companyCode: true, businessMode: true, isInternal: true } },
        stocks: { select: { quantity: true } },
      },
      orderBy: [{ tenant: { isInternal: "desc" } }, { tenant: { name: "asc" } }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
    prisma.tenant.findMany({
      orderBy: [{ isInternal: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        companyCode: true,
        businessMode: true,
        isInternal: true,
        _count: { select: { products: { where: { isArchived: false } } } },
      },
    }),
  ]);

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      costPrice: Number(item.costPrice),
      salePrice: Number(item.salePrice),
      safetyStock: Number(item.safetyStock),
      stockTotal: item.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0),
      stocks: undefined,
    })),
    tenants: tenants.map((tenant) => ({
      ...tenant,
      businessMode: normalizeBusinessMode(tenant.businessMode),
      productCount: tenant._count.products,
      _count: undefined,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePlatformAdmin();
  const input = ProductInput.parse(await req.json());
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true },
  });
  if (!tenant) throw new ApiError(404, "找不到指定租戶");

  const duplicate = await prisma.product.findUnique({
    where: { tenantId_sku: { tenantId: input.tenantId, sku: input.sku } },
    select: { id: true, isArchived: true },
  });
  if (duplicate && !duplicate.isArchived) throw new ApiError(409, `SKU ${input.sku} 已存在於此租戶`);

  const barcode = input.barcode || null;
  if (barcode) {
    const barcodeOwner = await prisma.product.findFirst({
      where: {
        tenantId: input.tenantId,
        barcode,
        isArchived: false,
        ...(duplicate ? { id: { not: duplicate.id } } : {}),
      },
      select: { sku: true },
    });
    if (barcodeOwner) throw new ApiError(409, `條碼已由 ${barcodeOwner.sku} 使用`);
  }

  const { stockQty, tenantId, ...productData } = input;
  const created = await prisma.$transaction(async (tx) => {
    const product = duplicate
      ? await tx.product.update({
          where: { id: duplicate.id },
          data: { ...productData, barcode, isArchived: false, updatedBy: session.user.name || session.user.username },
        })
      : await tx.product.create({
          data: { ...productData, barcode, tenantId, updatedBy: session.user.name || session.user.username },
        });
    const warehouse = await tx.warehouse.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (warehouse) {
      await tx.inventoryStock.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
        update: { quantity: stockQty },
        create: { tenantId, productId: product.id, warehouseId: warehouse.id, quantity: stockQty },
      });
    }
    return product;
  });

  await audit({ userId: session.user.id, action: duplicate ? "restore" : "create", module: "admin_products", refId: created.id, detail: `${input.tenantId}:${input.sku}` });
  return NextResponse.json(created, { status: 201 });
});
