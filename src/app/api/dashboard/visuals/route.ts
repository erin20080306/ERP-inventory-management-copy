import { NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { getDashboardVisualStats } from "@/lib/dashboard";
import { hasPermission } from "@/lib/auth";

export const GET = apiHandler(async () => {
  const session = await requirePermission("dashboard.view");
  const tenantId = await requireTenantId(session);
  const stats = await getDashboardVisualStats(tenantId, {
    sales: hasPermission(session.user.permissions, "sales.view"),
    purchases: hasPermission(session.user.permissions, "purchases.view"),
    inventory: hasPermission(session.user.permissions, "inventory.view"),
  });
  return NextResponse.json(stats);
});
