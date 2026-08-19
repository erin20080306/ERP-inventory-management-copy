import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashActivationKey, computeLicenseAccess } from "@/lib/license";
import { hasDirectLlm, classifyIntentDirect, summarizeDirect } from "@/lib/llm-assistant";
import { prisma } from "@/lib/prisma";

// 中央 AI 代理（只在你部署到 Vercel 的中央站運作）。
// 桌面安裝包沒有 AI 金鑰，會把「意圖分類 / 摘要」兩個純文字步驟轉發到這裡，由中央
// 用 AI Gateway（OIDC 或 AI_GATEWAY_API_KEY）呼叫 Gemini。報表查詢仍在客戶本機 DB
// 執行，這裡只收到問題字串與彙總後的報表數字。
//
// 授權：沿用授權那套 activationKey + deviceId 驗證，未授權裝置無法盜用你的 AI 額度。
export const dynamic = "force-dynamic";

const Input = z.object({
  phase: z.enum(["classify", "summarize"]),
  question: z.string().trim().min(1).max(2000),
  report: z.unknown().optional(),
  activationKey: z.string().trim().min(24).max(200),
  deviceId: z.string().trim().min(8).max(300),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  // 基本 IP 限流，避免被打爆額度
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (rate.count >= 60) return NextResponse.json({ error: "AI 請求過於頻繁" }, { status: 429 });
  else rate.count += 1;

  if (!hasDirectLlm()) {
    return NextResponse.json({ error: "中央 AI 服務尚未設定金鑰" }, { status: 503 });
  }

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  const { phase, question, report, activationKey } = parsed.data;

  // 驗證來源裝置的授權（同 /api/license/lease 的驗證方式）
  const keyHash = hashActivationKey(activationKey);
  const tenant = await prisma.tenant.findUnique({
    where: { licenseKeyHash: keyHash },
    select: {
      id: true, createdAt: true,
      licensePlan: true, licenseBilling: true, licenseStatus: true, licenseSeatLimit: true,
      licenseActivatedAt: true, licenseExpiresAt: true, licenseKeyHash: true, licenseVersion: true,
    },
  });
  if (!tenant) return NextResponse.json({ error: "啟用碼無效" }, { status: 401 });

  const access = computeLicenseAccess({
    tenantCreatedAt: tenant.createdAt,
    licensePlan: tenant.licensePlan,
    licenseBilling: tenant.licenseBilling,
    licenseStatus: tenant.licenseStatus,
    licenseSeatLimit: tenant.licenseSeatLimit,
    licenseActivatedAt: tenant.licenseActivatedAt,
    licenseExpiresAt: tenant.licenseExpiresAt,
    licenseKeyHash: tenant.licenseKeyHash,
    licenseVersion: tenant.licenseVersion,
  });
  if (!access.allowed) return NextResponse.json({ error: access.reason || "授權不可用" }, { status: 402 });

  try {
    if (phase === "classify") {
      const intent = await classifyIntentDirect(question);
      return NextResponse.json({ intent });
    }
    const summary = await summarizeDirect(question, report ?? {});
    return NextResponse.json({ summary });
  } catch (e: any) {
    console.error("[ai/central] LLM 失敗：", e);
    return NextResponse.json({ error: e?.message ?? "中央 AI 服務錯誤" }, { status: 502 });
  }
}
