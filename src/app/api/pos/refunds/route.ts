import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { queueEInvoiceAllowance } from "@/lib/e-invoice";
import { refundPosSale } from "@/lib/pos-refunds";

const RefundInput = z.object({
  shiftId: z.string().min(1),
  saleId: z.string().min(1),
  returnWarehouseId: z.string().min(1).optional(),
  reason: z.string().trim().min(2, "請輸入至少 2 個字的退款原因").max(500),
  items: z.array(z.object({
    saleItemId: z.string().min(1),
    quantity: z.coerce.number().positive().max(100_000),
    disposition: z.enum(["SELLABLE", "DAMAGED", "SCRAP"]).default("SELLABLE"),
  })).min(1).max(200),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "returns.create");
  const tenantId = await requireTenantId(session);
  const body = RefundInput.parse(await req.json());
  const result = await refundPosSale({
    tenantId,
    userId: session.user.id,
    shiftId: body.shiftId,
    saleId: body.saleId,
    items: body.items,
    reason: body.reason,
    returnWarehouseId: body.returnWarehouseId,
  });
  await audit({
    userId: session.user.id,
    action: "refund",
    module: "pos",
    refId: result.refund.id,
    detail: `${result.refund.number}；原交易 ${result.originalSaleNumber}；${result.fullyRefunded ? "全退" : "部分退"}`,
  });
  const eInvoiceEvent = await queueEInvoiceAllowance({
    tenantId,
    saleId: body.saleId,
    refundId: result.refund.id,
    refundNumber: result.refund.number,
    amount: Number(result.refund.total),
  });
  return NextResponse.json({
    ok: true,
    refund: result.refund,
    fullyRefunded: result.fullyRefunded,
    electronicInvoiceEvent: eInvoiceEvent,
    message: `${result.fullyRefunded ? "全額" : "部分"}退款完成；可售品已入 ${result.returnWarehouse.name}，瑕疵／報廢品未回可售庫存`,
  });
});
