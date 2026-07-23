import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import nodemailer from "nodemailer9";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Inquiry = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  company: z.string().trim().min(2).max(120),
  lineId: z.string().trim().max(80).optional().default(""),
  businessMode: z.enum(["ERP", "ECOMMERCE", "POS_RETAIL", "POS_RESTAURANT"]),
  plan: z.enum(["TEAM_2", "TEAM_3", "TEAM_5", "SMALL_8"]),
  billing: z.enum(["MONTHLY", "ANNUAL", "ONCE"]),
  notes: z.string().trim().max(2_000).optional().default(""),
  consent: z.literal(true),
  website: z.string().max(200).optional().default(""),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

function checkRateLimit(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 60 * 60_000 });
    return true;
  }
  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
    if (!checkRateLimit(ip)) return NextResponse.json({ ok: false, error: "送出次數過多，請一小時後再試" }, { status: 429 });
    const parsed = Inquiry.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "請確認必填資料與 Email 格式" }, { status: 400 });
    const data = parsed.data;
    if (data.website) return NextResponse.json({ ok: true });

    const email = data.email.toLowerCase();
    const recentCount = await prisma.planInquiry.count({
      where: { email, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    });
    if (recentCount >= 5) return NextResponse.json({ ok: false, error: "此 Email 送出次數過多，請一小時後再試" }, { status: 429 });
    const linkedUser = await prisma.user.findUnique({ where: { email }, select: { tenantId: true } });
    const ipHashKey = process.env.NEXTAUTH_SECRET || "erin-contact-ip-fingerprint";
    const inquiry = await prisma.planInquiry.create({
      data: {
        tenantId: linkedUser?.tenantId ?? null,
        name: data.name,
        email,
        company: data.company,
        lineId: data.lineId || null,
        businessMode: data.businessMode,
        planCode: data.plan,
        billing: data.billing,
        notes: data.notes || null,
        sourceIpHash: ip === "unknown" ? null : createHmac("sha256", ipHashKey).update(ip).digest("hex"),
      },
    });

    const user = process.env.GMAIL_USER || "erin20080306@gmail.com";
    const pass = process.env.GMAIL_APP_PASSWORD;
    const to = process.env.CONTACT_TO_EMAIL || "erin20080306@gmail.com";
    if (!pass) {
      await prisma.planInquiry.update({ where: { id: inquiry.id }, data: { notificationStatus: "NOT_CONFIGURED", notificationError: "Gmail 應用程式密碼尚未設定" } });
      return NextResponse.json({ ok: true, inquiryId: inquiry.id, warning: "需求已保留於管理後台；通知信尚未設定，亦可直接寄信至 erin20080306@gmail.com" }, { status: 202 });
    }

    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    const row = (label: string, value: string) => `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">${label}</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>`;
    const html = `<h2>ERP／POS 方案諮詢</h2><table style="border-collapse:collapse;font-family:sans-serif">${row("需求編號", inquiry.id)}${row("姓名", data.name)}${row("公司", data.company)}${row("Email", email)}${row("Line ID", data.lineId)}${row("系統", data.businessMode)}${row("方案", data.plan)}${row("週期", data.billing)}${row("備註", data.notes)}</table><p style="color:#666;font-size:12px">送出時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>`;

    try {
      await transporter.sendMail({
        from: `"艾琳 ERP／POS 諮詢" <${user}>`,
        to,
        replyTo: email,
        subject: `[方案諮詢] ${data.businessMode}・${data.company.slice(0, 50)}`,
        html,
      });
      await prisma.planInquiry.update({ where: { id: inquiry.id }, data: { notificationStatus: "SENT", notifiedAt: new Date(), notificationError: null } });
      return NextResponse.json({ ok: true, inquiryId: inquiry.id });
    } catch (error) {
      console.error("Email send error:", error);
      const message = error instanceof Error ? error.message.slice(0, 500) : "通知信寄送失敗";
      await prisma.planInquiry.update({ where: { id: inquiry.id }, data: { notificationStatus: "FAILED", notificationError: message } });
      return NextResponse.json({ ok: true, inquiryId: inquiry.id, warning: "需求已保留於管理後台，但通知信暫時寄送失敗" }, { status: 202 });
    }
  } catch (error) {
    console.error("Contact inquiry error:", error);
    return NextResponse.json({ ok: false, error: "需求無法保存，請直接寄信至 erin20080306@gmail.com" }, { status: 500 });
  }
}
