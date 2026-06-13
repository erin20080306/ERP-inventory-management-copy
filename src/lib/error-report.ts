import nodemailer from "nodemailer";
import { prisma } from "./prisma";

const ALERT_TO = "erin20080306@gmail.com";

type ErrorContext = {
  tenantId?: string | null;
  userId?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number;
  ip?: string | null;
  userAgent?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendAlertEmail(opts: {
  message: string;
  stack?: string;
  ctx: ErrorContext;
}): Promise<boolean> {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return false;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: ALERT_TO, pass },
  });

  const { ctx } = opts;
  const html = `
    <h2 style="color:#c0392b;">ERP 系統異常通知</h2>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      <tr><td><b>租戶</b></td><td>${escapeHtml(ctx.tenantId || "未知")}</td></tr>
      <tr><td><b>使用者</b></td><td>${escapeHtml(ctx.userId || "未知")}</td></tr>
      <tr><td><b>方法 / 路徑</b></td><td>${escapeHtml(`${ctx.method || "-"} ${ctx.path || "-"}`)}</td></tr>
      <tr><td><b>HTTP 狀態</b></td><td>${ctx.status ?? 500}</td></tr>
      <tr><td><b>IP</b></td><td>${escapeHtml(ctx.ip || "未知")}</td></tr>
      <tr><td><b>User-Agent</b></td><td>${escapeHtml(ctx.userAgent || "未知")}</td></tr>
      <tr><td><b>錯誤訊息</b></td><td>${escapeHtml(opts.message)}</td></tr>
    </table>
    ${opts.stack ? `<pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;">${escapeHtml(opts.stack)}</pre>` : ""}
    <p style="color:#666;font-size:12px;">發生時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
  `;

  await transporter.sendMail({
    from: `"ERP 系統異常通知" <${ALERT_TO}>`,
    to: ALERT_TO,
    subject: `[ERP異常] ${ctx.path || "未知路徑"} - ${opts.message.slice(0, 80)}`,
    html,
  });
  return true;
}

export async function reportError(error: any, ctx: ErrorContext = {}) {
  const message = String(error?.message ?? error ?? "未知錯誤").slice(0, 1000);
  const stack = error?.stack ? String(error.stack).slice(0, 4000) : undefined;
  const status = ctx.status ?? 500;

  let notified = false;
  try {
    notified = await sendAlertEmail({ message, stack, ctx });
  } catch (mailErr) {
    console.error("[reportError] email failed", mailErr);
  }

  try {
    await prisma.errorLog.create({
      data: {
        tenantId: ctx.tenantId ?? null,
        userId: ctx.userId ?? null,
        method: ctx.method ?? null,
        path: ctx.path ?? null,
        status,
        message,
        stack,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        notified,
      },
    });
  } catch (dbErr) {
    console.error("[reportError] db write failed", dbErr);
  }
}
