import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  const sale = await prisma.posSale.findFirst({
    where: { id: params.id, tenantId },
    include: {
      register: { include: { warehouse: true } },
      customer: true,
      electronicInvoice: { include: { events: { orderBy: { createdAt: "desc" } } } },
      exchangeRefund: { select: { id: true, number: true, total: true } },
      payments: true,
      items: { include: { product: true } },
      refunds: {
        where: { status: "COMPLETED" },
        include: { items: { include: { product: true } }, payments: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!sale) throw new ApiError(404, "找不到 POS 原交易");
  return NextResponse.json(sale);
});
