import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("inventory.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  
  const where: any = { tenantId };
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  
  const txns = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      product: { select: { sku: true, name: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  
  return NextResponse.json({ items: txns, total: txns.length });
});
