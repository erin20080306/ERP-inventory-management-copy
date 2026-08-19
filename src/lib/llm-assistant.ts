import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
// 兩種執行模式：
//   • direct（中央雲端 / 部署在 Vercel）：本機就有 AI 供應商（Gateway OIDC 或金鑰），
//     直接呼叫 LLM。
//   • proxy（桌面安裝包 / 跑在客戶電腦）：客戶端「沒有」AI 金鑰，改把「意圖分類」
//     與「摘要」兩個純文字步驟轉發到你的中央 Vercel（/api/ai/central），由中央用
//     Pro 額度呼叫 LLM。報表查詢一律在本機 DB 執行（runReportByIntent），只有
//     問題字串與彙總後的報表數字會離開機器，原始資料列不外流。
//
// 不論哪種模式，流程都是：classify(問題→意圖) → 本機跑報表 → summarize(數字→人話)。
// 皆不可用時，呼叫端退回關鍵字分派，功能不中斷。
// ─────────────────────────────────────────────────────────────────────────────

const DIRECT_MODEL_ID = process.env.AI_MODEL || "gemini-2.0-flash";
const GATEWAY_MODEL_ID = process.env.AI_GATEWAY_MODEL || "google/gemini-2.0-flash";

function useGateway(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

function googleApiKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
}

/** 本機是否具備可直接呼叫的 AI 供應商（中央/雲端用）。 */
export function hasDirectLlm(): boolean {
  return useGateway() || Boolean(googleApiKey());
}

/** 是否為桌面安裝包（需轉發到中央 Vercel）。沿用授權那組環境變數。 */
export function isDesktopProxy(): boolean {
  return Boolean(
    process.env.CENTRAL_LICENSE_URL && process.env.LOCAL_ACTIVATION_KEY && process.env.LOCAL_DEVICE_ID
  );
}

/** 任一模式可用即回 true；否則呼叫端退回關鍵字分派。 */
export function hasLlm(): boolean {
  return isDesktopProxy() || hasDirectLlm();
}

/** 依環境決定模型：Gateway 用字串（走 Vercel），否則用 Google provider。 */
function resolveModel() {
  if (useGateway()) return GATEWAY_MODEL_ID;
  const google = createGoogleGenerativeAI({ apiKey: googleApiKey() });
  return google(DIRECT_MODEL_ID);
}

export type LlmAssistantResult = {
  intent: AssistantIntent | null;
  aiSummary: string;
  report: AssistantResult | null;
};

const INTENT_GUIDE = ASSISTANT_INTENTS.map((i) => `${i.intent}: ${i.description}`).join("\n");
const INTENT_VALUES = ASSISTANT_INTENTS.map((i) => i.intent) as [AssistantIntent, ...AssistantIntent[]];

const CLASSIFY_SYSTEM = `你是 ERP 智慧助理的意圖分類器。依使用者問題，從清單中選出「最合適的一個」報表意圖。
可用意圖：
${INTENT_GUIDE}`;

const SUMMARY_SYSTEM = `你是一個 ERP 系統的智慧營運助理，服務台灣中小企業，使用繁體中文。
根據提供的報表資料，用 2~4 句話總結最關鍵的數字與洞察，需要時給一句可行動建議。
不可捏造資料中沒有的數字；若資料為空就說明查無資料。語氣專業、精簡。`;

// ── LLM 原語（direct 模式：本機直接呼叫） ──────────────────────────────────

/** 問題 → 意圖。中央端點與雲端直呼皆用此。 */
export async function classifyIntentDirect(question: string): Promise<AssistantIntent> {
  const { object } = await generateObject({
    model: resolveModel(),
    output: "enum",
    enum: INTENT_VALUES as unknown as string[],
    system: CLASSIFY_SYSTEM,
    prompt: question,
  });
  return object as AssistantIntent;
}

/** 報表數字 → 自然語言摘要。中央端點與雲端直呼皆用此。 */
export async function summarizeDirect(question: string, compact: unknown): Promise<string> {
  const { text } = await generateText({
    model: resolveModel(),
    system: SUMMARY_SYSTEM,
    prompt: `使用者問題：${question}\n\n報表資料（JSON）：\n${JSON.stringify(compact)}\n\n請用繁體中文總結。`,
  });
  return text ?? "";
}

// ── 轉發原語（proxy 模式：桌面轉發到中央） ─────────────────────────────────

async function callCentral(phase: "classify" | "summarize", payload: Record<string, unknown>): Promise<any> {
  const baseUrl = process.env.CENTRAL_LICENSE_URL!.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/api/ai/central`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      phase,
      activationKey: process.env.LOCAL_ACTIVATION_KEY,
      deviceId: process.env.LOCAL_DEVICE_ID,
      ...payload,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `中央 AI 服務錯誤（${res.status}）`);
  return data;
}

async function classifyIntentRemote(question: string): Promise<AssistantIntent> {
  const data = await callCentral("classify", { question });
  return data.intent as AssistantIntent;
}

async function summarizeRemote(question: string, compact: unknown): Promise<string> {
  const data = await callCentral("summarize", { question, report: compact });
  return (data.summary as string) ?? "";
}

// ── 報表壓縮 ───────────────────────────────────────────────────────────────

/** 將報表壓縮成精簡結構，控制 token 並避免原始資料列大量外流。 */
export function compactReport(report: AssistantResult): unknown {
  if (report.kind === "help") return { type: "help", message: report.message, examples: report.examples };
  if (report.kind === "followup") return { type: "followup", message: report.message, options: report.options };
  const r = report as ReportResult;
  return {
    title: r.title,
    description: r.description,
    cards: r.cards,
    tables: r.tables.map((t) => ({
      title: t.title,
      columns: t.columns,
      rows: t.rows.slice(0, 15), // 只餵前 15 列
      totalRows: t.rows.length,
    })),
  };
}

// ── 主流程 ─────────────────────────────────────────────────────────────────

/**
 * 執行一次智慧問答。失敗時擲出錯誤，呼叫端可退回關鍵字分派。
 * classify 與 summarize 依模式走本機或中央；報表查詢一律在本機 DB。
 */
export async function runLlmAssistant(tenantId: string, question: string): Promise<LlmAssistantResult> {
  if (!hasLlm()) throw new Error("未設定 AI 供應商");
  const proxy = isDesktopProxy();

  const intent = proxy ? await classifyIntentRemote(question) : await classifyIntentDirect(question);
  if (!intent) return { intent: null, aiSummary: "", report: null };

  const report = await runReportByIntent(tenantId, intent, question);
  const compact = compactReport(report);
  const aiSummary = proxy ? await summarizeRemote(question, compact) : await summarizeDirect(question, compact);

  const isReport = report.kind !== "help" && report.kind !== "followup";
  return { intent, aiSummary, report: isReport ? report : null };
}
