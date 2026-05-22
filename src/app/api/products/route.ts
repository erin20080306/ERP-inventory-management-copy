import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

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
  remark: z.string().optional().nullable(),
  stockQty: z.coerce.number().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("products.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = q
    ? { tenantId, OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q, mode: "insensitive" } }] }
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
    prisma.product.findMany({
      where,
      include: { category: true, unit: true, stocks: true, taxRate: true, salesItems: { select: { quantity: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return NextResponse.json({
    items: items.map((p: any) => {
      const stockTotal = p.stocks.reduce((s: number, x: any) => s + Number(x.quantity), 0);
      const soldTotal = p.salesItems.reduce((s: number, x: any) => s + Number(x.quantity), 0);
      return { ...p, stockTotal, soldTotal, salesItems: undefined };
    }),
    total,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("products.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = ProductInput.parse(await req.json());
  const upsert = req.nextUrl.searchParams.get("upsert") === "1";
  if (upsert) {
    const { stockQty, ...productData } = body;
    const result = await prisma.product.upsert({
      where: { tenantId_sku: { tenantId, sku: body.sku } },
      update: { ...productData, updatedBy: currentUserId } as any,
      create: { ...productData, tenantId, updatedBy: currentUserId } as any,
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
  const created = await prisma.product.create({ data: { ...createData, tenantId, updatedBy: currentUserId } as any });
  // 自動在預設倉庫建立庫存記錄（數量 0），確保庫存管理頁面可見
  const defaultWh = await prisma.warehouse.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: "asc" } });
  if (defaultWh) {
    await prisma.inventoryStock.upsert({
      where: { productId_warehouseId: { productId: created.id, warehouseId: defaultWh.id } },
      update: {},
      create: { tenantId, productId: created.id, warehouseId: defaultWh.id, quantity: 0 },
    });
  }
  await audit({ userId: session.user.id, action: "create", module: "products", refId: created.id, detail: created.sku });
  return NextResponse.json(created);
});
