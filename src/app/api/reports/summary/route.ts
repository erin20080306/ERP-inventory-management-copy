import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { getFinancialReportData } from "@/lib/reports";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("reports.view");
  const tenantId = await requireTenantId(session);
  const fromDate = req.nextUrl.searchParams.get("from");
  const toDate = req.nextUrl.searchParams.get("to");
  const data = await getFinancialReportData(tenantId, fromDate, toDate);
  return NextResponse.json(data);
});
