import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
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
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("products.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q
    ? { tenantId, OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q, mode: "insensitive" } }] }
    : { tenantId };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, unit: true, stocks: true, taxRate: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return NextResponse.json({
    items: items.map((p: any) => ({ ...p, stockTotal: p.stocks.reduce((s: number, x: any) => s + Number(x.quantity), 0) })),
    total,
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("products.create");
  const tenantId = await requireTenantId();
  const body = ProductInput.parse(await req.json());
  const created = await prisma.product.create({ data: { ...body, tenantId } as any });
  await audit({ userId: session.user.id, action: "create", module: "products", refId: created.id, detail: created.sku });
  return NextResponse.json(created);
});
