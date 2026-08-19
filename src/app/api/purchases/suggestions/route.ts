import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { computeReorderSuggestions, groupSuggestionsBySupplier } from "@/lib/reorder-forecast";

// 智慧補貨建議（預覽）：回傳依供應商分組的建議採購清單，供前端顯示與挑選。
// 純讀取、不寫入任何資料。
export const dynamic = "force-dynamic";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("purchases.view");
  const tenantId = await requireTenantId(session);
  const sp = req.nextUrl.searchParams;

  const demandWindowDays = clampInt(sp.get("windowDays"), 30, 7, 365);
  const reviewDays = clampInt(sp.get("reviewDays"), 7, 1, 180);
  const onlyActionable = sp.get("all") !== "1";

  const suggestions = await computeReorderSuggestions(tenantId, { demandWindowDays, reviewDays, onlyActionable });
  const groups = groupSuggestionsBySupplier(suggestions);

  const withSupplier = suggestions.filter((s) => s.supplierId);
  const withoutSupplier = suggestions.filter((s) => !s.supplierId);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    params: { demandWindowDays, reviewDays },
    summary: {
      itemCount: suggestions.length,
      criticalCount: suggestions.filter((s) => s.urgency === "critical").length,
      totalSuggestedQty: suggestions.reduce((sum, s) => sum + s.suggestedQty, 0),
      estimatedCost: Math.round(suggestions.reduce((sum, s) => sum + s.estimatedCost, 0) * 100) / 100,
      supplierGroupCount: groups.length,
      noSupplierCount: withoutSupplier.length,
    },
    groups,
    // 無法對應供應商、無法自動開單的品項另外列出，提醒使用者設定偏好供應商
    unassigned: withoutSupplier,
    suggestions: withSupplier,
  });
});

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}
