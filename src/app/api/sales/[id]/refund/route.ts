import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, audit, requirePermission, requireTenantId } from "@/lib/api";
import { refundStorefrontSalesOrder } from "@/lib/sales-refunds";

const RefundInput = z.object({
  reason: z.string().trim().min(2).max(500),
  refundReference: z.string().trim().min(2).max(200),
  items: z.array(z.object({
    orderItemId: z.string().min(1),
    quantity: z.coerce.number().positive().max(100_000),
    disposition: z.enum(["SELLABLE", "DAMAGED", "SCRAP"]).default("SELLABLE"),
  })).min(1).max(200),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("returns.create");
  await requirePermission("sales.view");
  const tenantId = await requireTenantId(session);
  const body = RefundInput.parse(await req.json());
  const result = await refundStorefrontSalesOrder({
    tenantId,
    userId: session.user.id,
    salesOrderId: params.id,
    reason: body.reason,
    refundReference: body.refundReference,
    items: body.items,
  });
  await audit({
    userId: session.user.id,
    action: "storefront_refund",
    module: "returns",
    refId: result.salesReturn.id,
    detail: `${result.salesReturn.number}；原單 ${result.originalOrderNumber}；${result.fullReturn ? "整筆退貨" : "部分退貨"}；退款 ${result.totals.total}`,
  });
  return NextResponse.json({
    ok: true,
    ...result,
    message: `${result.fullReturn ? "整筆" : "部分"}退款完成；銷貨退回、付款、庫存、應收與會計傳票已同步`,
  });
});