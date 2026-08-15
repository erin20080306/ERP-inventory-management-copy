import nodemailer from "nodemailer9";
import { prisma } from "./prisma";

// 集中管理「以租戶自訂 SMTP 寄件」的邏輯，供 AI 報表寄送、低庫存通知等共用。
// 各租戶在「系統設定 > SMTP 寄件設定」填入自己的寄件信箱，未設定則視為停用通知。

export type TenantMailer = {
  transporter: nodemailer.Transporter;
  fromName: string;
  fromEmail: string;
  company: {
    id: string;
    name: string;
    email: string | null;
  };
};

/**
 * 取得指定租戶的寄信器。若該租戶尚未完成 SMTP 設定則回傳 null（呼叫端可安全略過）。
 */
export async function getTenantMailer(tenantId: string): Promise<TenantMailer | null> {
  const company = await prisma.companySetting.findFirst({ where: { tenantId } });
  if (!company) return null;

  const smtpPort = Number(company.smtpPort ?? 0);
  const ready =
    Boolean(company.smtpHost) &&
    smtpPort > 0 &&
    Boolean(company.smtpUser) &&
    Boolean(company.smtpPassword) &&
    Boolean(company.smtpFromEmail);

  if (!ready) return null;

  const transporter = nodemailer.createTransport({
    host: company.smtpHost!,
    port: smtpPort,
    secure: company.smtpSecure,
    auth: { user: company.smtpUser!, pass: company.smtpPassword! },
  });

  const fromName = String(company.smtpFromName || company.name || "ERP 系統通知").replace(/"/g, "'");

  return {
    transporter,
    fromName,
    fromEmail: company.smtpFromEmail!,
    company: { id: company.id, name: company.name, email: company.email },
  };
}

/**
 * 以租戶寄件設定寄出一封信。回傳是否實際寄出（未設定 SMTP 時回傳 false）。
 */
export async function sendTenantMail(
  tenantId: string,
  opts: { to: string; subject: string; html: string }
): Promise<boolean> {
  const mailer = await getTenantMailer(tenantId);
  if (!mailer) return false;

  await mailer.transporter.sendMail({
    from: `"${mailer.fromName}" <${mailer.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return true;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
