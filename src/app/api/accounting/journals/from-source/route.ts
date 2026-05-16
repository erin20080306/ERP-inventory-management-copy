import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission } from "@/lib/api";
import {
  buildPurchaseReceiveDraft,
  buildSalesInvoiceDraft,
  buildPurchaseReturnDraft,
  buildSalesReturnDraft,
  buildReceivePaymentDraft,
  buildSupplierPaymentDraft,
  buildInvoiceDraft,
  buildPayrollPeriodDraft,
} from "@/lib/auto-journal";

/**
 * POST /api/accounting/journals/from-source
 * body: { sourceType, sourceId }
 *
 * 回傳分錄草稿 (DraftEntry)，前端拿到後填入傳票表單供使用者審核。
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission("journals.create");
  const { sourceType, sourceId } = (await req.json()) as { sourceType: string; sourceId: string };
  if (!sourceType || !sourceId) throw new Error("缺少 sourceType / sourceId");

  let draft;
  switch (sourceType) {
    case "PURCHASE":
      draft = await buildPurchaseReceiveDraft(sourceId);
      break;
    case "SALES":
      draft = await buildSalesInvoiceDraft(sourceId);
      break;
    case "PURCHASE_RETURN":
      draft = await buildPurchaseReturnDraft(sourceId);
      break;
    case "SALES_RETURN":
      draft = await buildSalesReturnDraft(sourceId);
      break;
    case "RECEIVE_PAYMENT":
      draft = await buildReceivePaymentDraft(sourceId);
      break;
    case "SUPPLIER_PAYMENT":
      draft = await buildSupplierPaymentDraft(sourceId);
      break;
    case "INVOICE":
      draft = await buildInvoiceDraft(sourceId);
      break;
    case "PAYROLL_PERIOD":
      draft = await buildPayrollPeriodDraft(sourceId);
      break;
    default:
      throw new Error(`不支援的來源類型：${sourceType}`);
  }

  return NextResponse.json(draft);
});
