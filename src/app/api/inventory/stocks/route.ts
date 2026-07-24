import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { productCatalogScope } from "@/lib/product-editions";
import {
  allocateCommerceReservationsToStocks,
  reservedCommerceQuantityByProduct,
} from "@/lib/commerce-checkout";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("inventory.view");
  const tenantId = await requireTenantId(session);
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";

  const where: any = {
    tenantId,
    product: productCatalogScope(session.user.businessMode),
  };
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
  
  const [stocks, total] = await Promise.all([
    prisma.inventoryStock.findMany({
      where,
      include: {
        product: { select: { sku: true, name: true, safetyStock: true, costPrice: true } },
        warehouse: { select: { name: true, code: true } },
      },
      orderBy: [{ warehouse: { code: "asc" } }, { product: { sku: "asc" } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inventoryStock.count({ where }),
  ]);
  
  const productIds = [...new Set(stocks.map((stock) => stock.productId))];
  const [allProductStocks, pendingWebLines] = productIds.length
    ? await Promise.all([
        prisma.inventoryStock.findMany({
          where: { tenantId, productId: { in: productIds } },
          select: {
            id: true,
            productId: true,
            quantity: true,
            warehouse: { select: { code: true, isActive: true } },
          },
        }),
        prisma.salesOrderItem.findMany({
          where: {
            productId: { in: productIds },
            order: {
              tenantId,
              status: { in: ["SUBMITTED", "APPROVED", "PARTIALLY_SHIPPED"] },
              remark: { startsWith: "[WEB]" },
            },
          },
          select: { productId: true, quantity: true, shippedQty: true },
        }),
      ])
    : [[], []];
  const reservedByProduct = reservedCommerceQuantityByProduct(pendingWebLines);
  const reservedByStock = allocateCommerceReservationsToStocks(allProductStocks, reservedByProduct);

  return NextResponse.json({
    items: stocks.map((stock) => {
      const quantity = Number(stock.quantity);
      const reservedQuantity = reservedByStock.get(stock.id) ?? 0;
      return {
        ...stock,
        reservedQuantity,
        availableQuantity: Math.max(0, quantity - reservedQuantity),
      };
    }),
    total,
  });
});
