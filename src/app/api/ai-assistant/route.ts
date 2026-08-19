import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { getAssistantPermissionCode, runAssistantQuery } from "@/lib/ai-assistant";
import { hasLlm, runLlmAssistant } from "@/lib/llm-assistant";

export const POST = apiHandler(async (req: NextRequest) => {
  const { question } = await req.json();
  const requiredPermission = getAssistantPermissionCode(question);
  await requirePermission(requiredPermission);
  const tenantId = await requireTenantId();

  // 有設定 GEMINI_API_KEY 時走 LLM 智慧問答；失敗則自動退回關鍵字分派，確保不中斷。
  if (hasLlm()) {
    try {
      const llm = await runLlmAssistant(tenantId, question);
      if (llm.report) {
        return NextResponse.json({ ...llm.report, aiSummary: llm.aiSummary, engine: "llm" });
      }
      // 模型沒取到具體報表時，退回關鍵字結果，但保留模型的文字回覆
      const fallback = await runAssistantQuery(tenantId, question);
      return NextResponse.json({ ...fallback, aiSummary: llm.aiSummary || undefined, engine: "llm-fallback" });
    } catch (e) {
      console.error("[ai-assistant] LLM 失敗，退回關鍵字分派：", e);
    }
  }

  const result = await runAssistantQuery(tenantId, question);
  return NextResponse.json({ ...result, engine: "keyword" });
});
