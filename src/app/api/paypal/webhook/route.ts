import { NextResponse } from "next/server";

// 依商業流程要求移除線上付款與自動開通；保留 410 回應避免舊 Webhook 被誤用。
export async function POST() {
  return NextResponse.json({ error: "PayPal 付款與自動開通已停用，請聯絡艾琳設計" }, { status: 410 });
}
