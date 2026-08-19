import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from "@google/generative-ai";
import {
  ASSISTANT_INTENTS,
  runReportByIntent,
  type AssistantIntent,
  type AssistantResult,
  type ReportResult,
} from "@/lib/ai-assistant";

// ─────────────────────────────────────────────────────────────────────────────
// Gemini 智慧問答
//
// 以 Gemini 做「意圖路由 + 自然語言總結」，實際資料仍由既有的 buildXxx 報表函式
// 提供（透過 get_report 工具）。好處：
//   1. 使用者可自由發問，不受關鍵字限制；
//   2. 不讓模型直接產生 SQL，查詢一律走已加 tenantId 過濾的函式，安全；
//   3. 回覆是「人話」摘要，附上原本的卡片/表格供前端呈現。
// 未設定 GEMINI_API_KEY 時 hasLlm() 回 false，呼叫端會退回關鍵字分派。
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const MAX_TOOL_ROUNDS = 3;

export function hasLlm(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
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

function buildGetReportDeclaration(): FunctionDeclaration {
  const intents = ASSISTANT_INTENTS.map((i) => i.intent);
  const guide = ASSISTANT_INTENTS.map((i) => `${i.intent}: ${i.description}`).join("\n");
  return {
    name: "get_report",
    description: `依使用者問題取得對應的 ERP 報表資料。可用意圖：\n${guide}`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        intent: {
          type: SchemaType.STRING,
          format: "enum",
          enum: intents,
          description: "要查詢的報表意圖",
        },
        question: {
          type: SchemaType.STRING,
          description: "轉述使用者的原始問題（保留期間、商品名等關鍵字，供報表解析）",
        },
      },
      required: ["intent", "question"],
    },
  };
}

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
 * 用 Gemini 執行一次智慧問答。失敗時擲出錯誤，呼叫端可退回關鍵字分派。
 */
export async function runLlmAssistant(tenantId: string, question: string): Promise<LlmAssistantResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("未設定 GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    tools: [{ functionDeclarations: [buildGetReportDeclaration()] }],
  });

  const chat = model.startChat();
  let response = (await chat.sendMessage(question)).response;

  let primaryReport: AssistantResult | null = null;
  let primaryIntent: AssistantIntent | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const calls = response.functionCalls();
    if (!calls || calls.length === 0) break;

    // 逐一執行模型要求的報表，並把結果一次回覆（協定要求回應每個 call）
    const parts = [];
    for (const call of calls) {
      if (call.name !== "get_report") {
        parts.push({ functionResponse: { name: call.name, response: { error: "未知工具" } } });
        continue;
      }
      const args = (call.args ?? {}) as { intent?: string; question?: string };
      const intent = (args.intent ?? "") as AssistantIntent;
      const q = args.question || question;
      let report: AssistantResult;
      try {
        report = await runReportByIntent(tenantId, intent, q);
      } catch (e: any) {
        parts.push({ functionResponse: { name: "get_report", response: { error: e?.message ?? "報表產生失敗" } } });
        continue;
      }
      if (!primaryReport && report.kind !== "help" && report.kind !== "followup") {
        primaryReport = report;
        primaryIntent = intent;
      }
      parts.push({ functionResponse: { name: "get_report", response: { data: compactReport(report) } } });
    }
    response = (await chat.sendMessage(parts)).response;
  }

  const aiSummary = safeText(response);
  return { intent: primaryIntent, aiSummary, report: primaryReport };
}

function safeText(response: any): string {
  try {
    return response.text() || "";
  } catch {
    return "";
  }
}
