import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { getAssistantPermissionCode, runAssistantQuery } from "@/lib/ai-assistant";

export const POST = apiHandler(async (req: NextRequest) => {
  const { question } = await req.json();
  const requiredPermission = getAssistantPermissionCode(question);
  await requirePermission(requiredPermission);
  const tenantId = await requireTenantId();
  const result = await runAssistantQuery(tenantId, question);
  return NextResponse.json(result);
});
