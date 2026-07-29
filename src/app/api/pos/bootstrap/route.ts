import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { loadPosBootstrap, type PosWorkspaceMode } from "@/lib/pos-bootstrap";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { isIosAppRequest } from "@/lib/client-platform";

const POS_WORKSPACE_MODES = new Set<PosWorkspaceMode>(["POS_RETAIL", "POS_RESTAURANT", "POS_MEDICAL"]);

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  const requestedMode = (req.nextUrl.searchParams.get("mode") || "POS_RETAIL") as PosWorkspaceMode;
  if (!POS_WORKSPACE_MODES.has(requestedMode)) throw new ApiError(400, "不支援的 POS 工作區");
  if (requestedMode === "POS_MEDICAL" && isIosAppRequest(req.headers)) {
    throw new ApiError(403, "iOS App 暫不提供醫美 POS 工作區");
  }
  if (!session.user.isSuperAdmin && normalizeBusinessMode(session.user.businessMode) !== requestedMode) {
    throw new ApiError(403, "此公司未啟用指定的 POS 工作區");
  }
  return NextResponse.json(await loadPosBootstrap({
    tenantId,
    userId: session.user.id,
    mode: requestedMode,
    canApproveCash: hasPermission(session.user.permissions, "cash.approve"),
  }));
});
