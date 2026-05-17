import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PayPal Webhook 驗證 + 自動啟用永久使用
// 環境變數：PAYPAL_WEBHOOK_ID, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
// PayPal 設定：Webhook URL = https://你的domain/api/paypal/webhook
// Event type: PAYMENT.CAPTURE.COMPLETED 或 CHECKOUT.ORDER.COMPLETED

export async function POST(req: NextRequest) {
  const body = await req.text();
  const event = JSON.parse(body);

  // 1. 驗證 Webhook 簽章（生產環境必須啟用）
  const isValid = await verifyWebhookSignature(req, body);
  if (!isValid) {
    console.error("[PayPal Webhook] 簽章驗證失敗");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. 處理付款完成事件
  const eventType = event.event_type;
  if (eventType === "PAYMENT.CAPTURE.COMPLETED" || eventType === "CHECKOUT.ORDER.COMPLETED") {
    // 從 PayPal 事件中提取付款者 email（custom_id 或 payer email）
    const resource = event.resource;
    let payerEmail = "";
    let customId = "";

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      payerEmail = resource?.payer?.email_address ?? "";
      customId = resource?.custom_id ?? "";
    } else {
      // CHECKOUT.ORDER.COMPLETED
      payerEmail = resource?.payer?.email_address ?? "";
      customId = resource?.purchase_units?.[0]?.custom_id ?? "";
    }

    // custom_id 可以是用戶 ID 或 email，優先用 custom_id
    const identifier = customId || payerEmail;

    if (!identifier) {
      console.error("[PayPal Webhook] 無法識別付款用戶", event);
      return NextResponse.json({ error: "No identifier" }, { status: 400 });
    }

    // 3. 查找用戶並啟用
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: identifier },
          { email: identifier },
          { email: payerEmail },
        ],
      },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isPaid: true },
      });
      console.log(`[PayPal Webhook] 用戶 ${user.email} (${user.id}) 已啟用永久使用`);
    } else {
      // 找不到用戶，記錄到 log 供管理員手動處理
      console.warn(`[PayPal Webhook] 找不到用戶: ${identifier} / ${payerEmail}`);
    }
  }

  return NextResponse.json({ received: true });
}

// ─── PayPal Webhook 簽章驗證 ───
async function verifyWebhookSignature(req: NextRequest, body: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE ?? "live"; // sandbox | live

  // 未設定環境變數時跳過驗證（開發用）
  if (!webhookId || !clientId || !clientSecret) {
    console.warn("[PayPal Webhook] 未設定 PAYPAL 環境變數，跳過簽章驗證");
    return true;
  }

  const baseUrl = mode === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  try {
    // 取得 access token
    const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const authData = await authRes.json();
    const accessToken = authData.access_token;

    // 驗證簽章
    const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: req.headers.get("paypal-auth-algo"),
        cert_url: req.headers.get("paypal-cert-url"),
        transmission_id: req.headers.get("paypal-transmission-id"),
        transmission_sig: req.headers.get("paypal-transmission-sig"),
        transmission_time: req.headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    });
    const verifyData = await verifyRes.json();
    return verifyData.verification_status === "SUCCESS";
  } catch (err) {
    console.error("[PayPal Webhook] 驗證過程錯誤:", err);
    return false;
  }
}
