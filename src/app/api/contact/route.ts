import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!pass) {
      return NextResponse.json({ ok: false, error: "尚未設定 GMAIL_APP_PASSWORD 環境變數" }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "erin20080306@gmail.com",
        pass,
      },
    });

    const html = `
      <h2>ERP系統諮詢表單</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;">
        <tr><td><b>姓名</b></td><td>${data.name || ""}</td></tr>
        <tr><td><b>Email</b></td><td>${data.email || ""}</td></tr>
        <tr><td><b>Line ID</b></td><td>${data.lineId || ""}</td></tr>
        <tr><td><b>使用平台</b></td><td>${data.platform || ""}</td></tr>
        <tr><td><b>資料格式</b></td><td>${data.dataFormat || ""}</td></tr>
        <tr><td><b>需求</b></td><td>${data.problem || ""}</td></tr>
        <tr><td><b>方案</b></td><td>${data.plan || ""}</td></tr>
        <tr><td><b>備註</b></td><td>${(data.notes || "").replace(/\n/g, "<br>")}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;">送出時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
    `;

    await transporter.sendMail({
      from: `"ERP諮詢表單" <erin20080306@gmail.com>`,
      to: "erin20080306@gmail.com",
      replyTo: data.email || undefined,
      subject: `ERP諮詢 - ${data.name || "未填姓名"} (${data.plan || "未選方案"})`,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Email send error:", error);
    return NextResponse.json({ ok: false, error: error.message || "寄信失敗" }, { status: 500 });
  }
}
