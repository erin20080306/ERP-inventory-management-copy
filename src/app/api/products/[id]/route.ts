import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode, productCatalogScope } from "@/lib/product-editions";

const ALLOWED_FIELDS = ["sku", "barcode", "name", "spec", "description", "imageUrl", "categoryId", "unitId", "costPrice", "salePrice", "safetyStock", "taxRateId", "isActive", "isPublished", "remark"];

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("products.edit");
  const tenantId = await requireTenantId(session);
  const catalogMode = normalizeBusinessMode(session.user.businessMode);
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const data: any = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) data[key] = body[key];
  }
  if ("barcode" in data) {
    data.barcode = typeof data.barcode === "string" && data.barcode.trim() ? data.barcode.trim() : null;
    if (data.barcode) {
      const duplicate = await prisma.product.findFirst({
        where: {
          tenantId,
          barcode: data.barcode,
          id: { not: params.id },
          AND: [productCatalogScope(catalogMode)],
        },
        select: { sku: true, name: true },
      });
      if (duplicate) throw new ApiError(409, `條碼 ${data.barcode} 已由 ${duplicate.sku} ${duplicate.name} 使用`);
    }
  }
  const product = await prisma.product.findFirst({
    where: { id: params.id, tenantId, AND: [productCatalogScope(catalogMode)] },
    select: { id: true },
  });
  if (!product) throw new ApiError(404, "找不到目前營運模式的商品");
  data.catalogMode = catalogMode;
  data.updatedBy = currentUserId;
  const u = await prisma.product.update({ where: { id: params.id, tenantId }, data });
  await audit({ userId: session.user.id, action: "update", module: "products", refId: params.id });
  return NextResponse.json(u);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("products.delete");
  const tenantId = await requireTenantId(session);
  const catalogMode = normalizeBusinessMode(session.user.businessMode);
  const product = await prisma.product.findFirst({
    where: { id: params.id, tenantId, AND: [productCatalogScope(catalogMode)] },
    select: { id: true },
  });
  if (!product) throw new ApiError(404, "找不到目前營運模式的商品");
  await prisma.product.update({
    where: { id: params.id, tenantId },
    data: { isArchived: true, isActive: false, isPublished: false, updatedBy: await getCurrentUserId() },
  });
  await audit({ userId: session.user.id, action: "delete", module: "products", refId: params.id });
  return NextResponse.json({ ok: true, mode: "ARCHIVED" });
});
