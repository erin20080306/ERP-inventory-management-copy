import { NextRequest, NextResponse } from "next/server";
import { scanLowStock, type TenantLowStock } from "@/lib/low-stock";
import { sendTenantMail, escapeHtml } from "@/lib/mailer";

// 低庫存每日通知：掃描各租戶低於安全庫存的商品，透過該租戶 SMTP 寄出提醒信。
// 由 Vercel Cron（見 vercel.json）每日呼叫，或外部 cron 帶 CRON_SECRET 觸發。
export const dynamic = "force-dynamic";

function buildEmailHtml(tenant: TenantLowStock): string {
  const rows = tenant.items
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(item.sku)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${item.onHand}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${item.safetyStock}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;color:#c0392b;font-weight:600;">-${item.shortage}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111;">
      <h2 style="color:#c0392b;margin-bottom:4px;">低庫存提醒</h2>
      <p style="color:#374151;">${escapeHtml(tenant.tenantName)} 目前有 <b>${tenant.items.length}</b> 項商品低於安全庫存，建議儘速補貨：</p>
      <table style="border-collapse:collapse;font-size:13px;margin-top:8px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">SKU</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">品名</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">現有庫存</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">安全庫存</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">缺額</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:12px;">寄送時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
    </div>`;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const tenants = await scanLowStock();
    let sent = 0;
    let skippedNoMailer = 0;
    let skippedNoRecipient = 0;

    for (const tenant of tenants) {
      // 收件人：優先用公司設定的 email（可日後擴充為採購/倉管角色清單）
      const to = tenant.companyEmail?.trim();
      if (!to) {
        skippedNoRecipient++;
        continue;
      }
      const delivered = await sendTenantMail(tenant.tenantId, {
        to,
        subject: `[庫存警示] ${tenant.items.length} 項商品低於安全庫存`,
        html: buildEmailHtml(tenant),
      });
      if (delivered) sent++;
      else skippedNoMailer++;
    }

    return NextResponse.json({
      ok: true,
      tenantsWithLowStock: tenants.length,
      emailsSent: sent,
      skippedNoMailer,
      skippedNoRecipient,
      time: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "低庫存通知失敗" },
      { status: 500 }
    );
  }
}
