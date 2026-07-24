import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const channel = req.nextUrl.searchParams.get("channel") ?? "all";
  const sales = await prisma.posSale.findMany({
    where: {
      tenantId,
      status: { not: "VOIDED" },
      ...(channel === "restaurant" ? { restaurantOrder: { isNot: null } } : {}),
      ...(query ? {
        OR: [
          { number: { contains: query, mode: "insensitive" as const } },
          { receiptNo: { contains: query, mode: "insensitive" as const } },
          { customer: { companyName: { contains: query, mode: "insensitive" as const } } },
        ],
      } : {}),
    },
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      receiptNo: true,
      total: true,
      status: true,
      createdAt: true,
      register: { select: { code: true, name: true } },
      customer: { select: { companyName: true } },
      restaurantOrder: { select: { number: true, table: { select: { name: true } } } },
      items: { select: { quantity: true, returnedQty: true } },
      refunds: { where: { status: "COMPLETED" }, select: { total: true } },
    },
  });
  return NextResponse.json({
    items: sales.map((sale) => ({
      ...sale,
      refundedTotal: sale.refunds.reduce((sum, refund) => sum + Number(refund.total), 0),
      refundableQuantity: sale.items.reduce((sum, item) => sum + Number(item.quantity) - Number(item.returnedQty), 0),
    })),
  });
});
