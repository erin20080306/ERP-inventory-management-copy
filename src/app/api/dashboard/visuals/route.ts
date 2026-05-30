import { NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { getDashboardVisualStats } from "@/lib/dashboard";

export const GET = apiHandler(async () => {
  const session = await requirePermission("dashboard.view");
  const tenantId = await requireTenantId(session);
  const stats = await getDashboardVisualStats(tenantId);
  return NextResponse.json(stats);
});
