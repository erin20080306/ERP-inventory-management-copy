import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { BUSINESS_MODES } from "@/lib/product-editions";

const CATALOGS = new Set<string>(BUSINESS_MODES);
const ProductPatch = z.object({
  catalogMode: z.string().refine((value) => CATALOGS.has(value), "商品目錄類型不正確").optional(),
  sku: z.string().trim().min(1).max(100).optional(),
  barcode: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(1).max(200).optional(),
  spec: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  imageUrl: z.string().trim().max(2000).optional().nullable(),
  costPrice: z.coerce.number().min(0).optional(),
  salePrice: z.coerce.number().min(0).optional(),
  safetyStock: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  remark: z.string().trim().max(1000).optional().nullable(),
});

async function requirePlatformAdmin() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限平台超級管理員");
  return session;
}

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePlatformAdmin();
  const data = ProductPatch.parse(await req.json());
  const existing = await prisma.product.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true, sku: true },
  });
  if (!existing) throw new ApiError(404, "找不到商品");

  if (data.sku && data.sku !== existing.sku) {
    const duplicate = await prisma.product.findUnique({
      where: { tenantId_sku: { tenantId: existing.tenantId, sku: data.sku } },
      select: { id: true },
    });
    if (duplicate) throw new ApiError(409, `SKU ${data.sku} 已存在於此租戶`);
  }
  const barcode = "barcode" in data ? data.barcode || null : undefined;
  if (barcode) {
    const duplicate = await prisma.product.findFirst({
      where: { tenantId: existing.tenantId, barcode, isArchived: false, id: { not: existing.id } },
      select: { sku: true },
    });
    if (duplicate) throw new ApiError(409, `條碼已由 ${duplicate.sku} 使用`);
  }

  const updated = await prisma.product.update({
    where: { id: existing.id },
    data: {
      ...data,
      ...("barcode" in data ? { barcode } : {}),
      updatedBy: session.user.name || session.user.username,
    },
  });
  await audit({ userId: session.user.id, action: "update", module: "admin_products", refId: updated.id, detail: existing.tenantId });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePlatformAdmin();
  const existing = await prisma.product.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true },
  });
  if (!existing) throw new ApiError(404, "找不到商品");
  await prisma.product.update({
    where: { id: existing.id },
    data: {
      isArchived: true,
      isActive: false,
      isPublished: false,
      updatedBy: session.user.name || session.user.username,
    },
  });
  await audit({ userId: session.user.id, action: "archive", module: "admin_products", refId: existing.id, detail: existing.tenantId });
  return NextResponse.json({ ok: true });
});
