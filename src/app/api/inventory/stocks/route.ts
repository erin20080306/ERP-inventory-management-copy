import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("inventory.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  
  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { product: { sku: { contains: q, mode: "insensitive" } } },
      { product: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  
  const stocks = await prisma.inventoryStock.findMany({
    where,
    include: { product: true, warehouse: true },
    orderBy: [{ warehouse: { code: "asc" } }, { product: { sku: "asc" } }],
  });
  
  return NextResponse.json({ items: stocks, total: stocks.length });
});
