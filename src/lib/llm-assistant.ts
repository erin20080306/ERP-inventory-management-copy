import { generateText, tool, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import {
  ASSISTANT_INTENTS,
  runReportByIntent,
  type AssistantIntent,
  type AssistantResult,
  type ReportResult,
} from "@/lib/ai-assistant";

// ─────────────────────────────────────────────────────────────────────────────
// AI 智慧問答（Vercel AI SDK + Gemini）
//
// 以 LLM 做「意圖路由 + 自然語言總結」，實際資料仍由既有的 buildXxx 報表函式
// 透過 get_report 工具提供。不讓模型直接產生 SQL，查詢一律走已加 tenantId 過濾
// 的函式，安全；回覆為「人話」摘要，並附上原本卡片/表格供前端呈現。
//
// 供應商解析優先序：
//   1. Vercel AI Gateway（AI_GATEWAY_API_KEY，或部署在 Vercel 上的 OIDC）
//      → 用 Vercel Pro 內含額度，統一計費/限額/觀測，正式環境可零金鑰。
//   2. 直接呼叫 Google（GOOGLE_GENERATIVE_AI_API_KEY 或 GEMINI_API_KEY）。
//   3. 皆無 → hasLlm() 回 false，呼叫端退回關鍵字分派，功能不中斷。
// ─────────────────────────────────────────────────────────────────────────────

const DIRECT_MODEL_ID = process.env.AI_MODEL || "gemini-2.0-flash";
const GATEWAY_MODEL_ID = process.env.AI_GATEWAY_MODEL || "google/gemini-2.0-flash";
const MAX_STEPS = 4;

function useGateway(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

function googleApiKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
}

export function hasLlm(): boolean {
  return useGateway() || Boolean(googleApiKey());
}

/** 依環境決定模型：Gateway 用字串（走 Vercel），否則用 Google provider。 */
function resolveModel() {
  if (useGateway()) return GATEWAY_MODEL_ID; // 字串模型 → 由內建 Vercel AI Gateway 路由
  const google = createGoogleGenerativeAI({ apiKey: googleApiKey() });
  return google(DIRECT_MODEL_ID);
}

export type LlmAssistantResult = {
  intent: AssistantIntent | null;
  aiSummary: string;
  report: AssistantResult | null;
};

const SYSTEM_INSTRUCTION = `你是一個 ERP 系統的智慧營運助理，服務台灣中小企業，使用繁體中文。
規則：
1. 你「不能」自行捏造任何數字；所有數據一律透過 get_report 工具取得。
2. 依使用者問題選擇最合適的報表意圖呼叫 get_report；模糊時選最接近的。
3. 拿到資料後，用 2~4 句話總結最關鍵的數字與洞察，並在有需要時給一句可行動建議。
4. 若資料為空或無結果，直接說明查無資料，不要編造。
5. 語氣專業、精簡，像一位可靠的營運分析師。`;

const INTENT_GUIDE = ASSISTANT_INTENTS.map((i) => `${i.intent}: ${i.description}`).join("\n");
const INTENT_VALUES = ASSISTANT_INTENTS.map((i) => i.intent) as [AssistantIntent, ...AssistantIntent[]];

/** 將報表壓縮成精簡結構餵回模型，控制 token。 */
function compactReport(report: AssistantResult): unknown {
  if (report.kind === "help") {
    return { type: "help", message: report.message, examples: report.examples };
  }
  if (report.kind === "followup") {
    return { type: "followup", message: report.message, options: report.options };
  }
  const r = report as ReportResult;
  return {
    title: r.title,
    description: r.description,
    cards: r.cards,
    tables: r.tables.map((t) => ({
      title: t.title,
      columns: t.columns,
      rows: t.rows.slice(0, 15), // 只餵前 15 列，避免 token 爆量
      totalRows: t.rows.length,
    })),
  };
}

/**
 * 用 LLM 執行一次智慧問答。失敗時擲出錯誤，呼叫端可退回關鍵字分派。
 */
export async function runLlmAssistant(tenantId: string, question: string): Promise<LlmAssistantResult> {
  if (!hasLlm()) throw new Error("未設定 AI 供應商金鑰");

  let primaryReport: AssistantResult | null = null;
  let primaryIntent: AssistantIntent | null = null;

  const result = await generateText({
    model: resolveModel(),
    system: SYSTEM_INSTRUCTION,
    prompt: question,
    stopWhen: stepCountIs(MAX_STEPS),
    tools: {
      get_report: tool({
        description: `依使用者問題取得對應的 ERP 報表資料。可用意圖：\n${INTENT_GUIDE}`,
        inputSchema: z.object({
          intent: z.enum(INTENT_VALUES).describe("要查詢的報表意圖"),
          question: z.string().describe("轉述使用者原始問題（保留期間、商品名等關鍵字，供報表解析）"),
        }),
        execute: async ({ intent, question: q }) => {
          const report = await runReportByIntent(tenantId, intent, q || question);
          if (!primaryReport && report.kind !== "help" && report.kind !== "followup") {
            primaryReport = report;
            primaryIntent = intent;
          }
          return { data: compactReport(report) };
        },
      }),
    },
  });

  return { intent: primaryIntent, aiSummary: result.text ?? "", report: primaryReport };
}
