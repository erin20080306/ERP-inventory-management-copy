import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeReorderSuggestions, type ReorderSuggestion } from "@/lib/reorder-forecast";
import { sendTenantMail, escapeHtml } from "@/lib/mailer";

// 每日智慧補貨建議：掃描各租戶需補貨的品項，寄出「建議採購清單」提醒信。
// 由 Vercel Cron（見 vercel.json）每日呼叫，或外部 cron 帶 CRON_SECRET 觸發。
// 與低庫存通知不同：這裡是「該補多少、跟誰買」的可行動建議，非單純警示。
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";

function buildEmailHtml(tenantName: string, rows: ReorderSuggestion[], totalCost: number): string {
  const body = rows
    .slice(0, 50)
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(r.sku)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(r.name)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${r.onHand}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${r.avgDailyDemand}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;font-weight:600;color:#2563eb;">${r.suggestedQty}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(r.supplierName)}</td>
      </tr>`
    )
    .join("");

  const link = APP_URL ? `<p style="margin-top:12px;"><a href="${APP_URL}/purchases/reorder" style="color:#2563eb;">前往智慧補貨，一鍵生成採購草稿 →</a></p>` : "";

  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111;">
      <h2 style="color:#2563eb;margin-bottom:4px;">今日智慧補貨建議</h2>
      <p style="color:#374151;">${escapeHtml(tenantName)} 有 <b>${rows.length}</b> 項商品建議補貨，預估採購金額 <b>NT$ ${Math.round(totalCost).toLocaleString("zh-TW")}</b>：</p>
      <table style="border-collapse:collapse;font-size:13px;margin-top:8px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">SKU</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">品名</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">現貨</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">日均需求</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">建議採購量</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">參考供應商</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      ${link}
      <p style="color:#6b7280;font-size:12px;margin-top:12px;">寄送時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
    </div>`;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    // 只掃描有設定通知信箱的租戶
    const companies = await prisma.companySetting.findMany({
      where: { email: { not: null } },
      select: { tenantId: true, name: true, email: true },
    });

    let sent = 0;
    let skippedNoMailer = 0;
    let tenantsWithSuggestions = 0;

    for (const company of companies) {
      const to = company.email?.trim();
      if (!to) continue;

      const suggestions = await computeReorderSuggestions(company.tenantId, { onlyActionable: true });
      if (suggestions.length === 0) continue;
      tenantsWithSuggestions++;

      const totalCost = suggestions.reduce((sum, s) => sum + s.estimatedCost, 0);
      const delivered = await sendTenantMail(company.tenantId, {
        to,
        subject: `[智慧補貨] ${suggestions.length} 項商品建議採購`,
        html: buildEmailHtml(company.name ?? "貴公司", suggestions, totalCost),
      });
      if (delivered) sent++;
      else skippedNoMailer++;
    }

    return NextResponse.json({
      ok: true,
      tenantsWithSuggestions,
      emailsSent: sent,
      skippedNoMailer,
      time: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? "補貨建議通知失敗" }, { status: 500 });
  }
}
