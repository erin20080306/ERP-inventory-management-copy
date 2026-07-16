import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer9";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import {
  buildAssistantExcelBuffer,
  buildAssistantHtmlReport,
  getAssistantPermissionCode,
  runAssistantQuery,
} from "@/lib/ai-assistant";
import { prisma } from "@/lib/prisma";

function assertEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
}

export const POST = apiHandler(async (req: NextRequest) => {
  const { question, email, format, pdfAttachment } = await req.json();
  await requirePermission(getAssistantPermissionCode(question));
  const tenantId = await requireTenantId();
  const to = String(email ?? "").trim();
  const selectedFormat = String(format ?? "excel");

  if (!assertEmail(to)) {
    return NextResponse.json({ error: "請輸入有效的收件信箱。" }, { status: 400 });
  }

  const company = await prisma.companySetting.findFirst({ where: { tenantId } });
  const smtpPort = Number(company?.smtpPort ?? 0);
  const hasTenantMailer =
    Boolean(company?.smtpHost) &&
    smtpPort > 0 &&
    Boolean(company?.smtpUser) &&
    Boolean(company?.smtpPassword) &&
    Boolean(company?.smtpFromEmail);

  if (!hasTenantMailer) {
    return NextResponse.json(
      { error: "尚未設定此租戶的 SMTP 寄件信箱，請到「系統設定 > SMTP 寄件設定」新增寄件信箱後再寄送。" },
      { status: 400 }
    );
  }

  const result = await runAssistantQuery(tenantId, question);
  if (result.kind === "help") {
    return NextResponse.json({ error: "目前問題還沒有產生可寄送的報表，請先查詢銷售、庫存、應收、排行、採購、成本、異常或營運摘要。" }, { status: 400 });
  }
  if (result.kind === "followup") {
    return NextResponse.json({ error: "目前查詢需要進一步確認，請先在 AI 助手介面中選擇選項後再寄送報表。" }, { status: 400 });
  }

  const filenameBase = cleanFilename(result.title);
  const html = buildAssistantHtmlReport(result);
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];

  if (selectedFormat === "excel") {
    attachments.push({
      filename: `${filenameBase}.xlsx`,
      content: await buildAssistantExcelBuffer(result),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } else if (selectedFormat === "word") {
    attachments.push({
      filename: `${filenameBase}.doc`,
      content: Buffer.from(html, "utf8"),
      contentType: "application/msword; charset=utf-8",
    });
  } else if (selectedFormat === "pdf") {
    const content = String(pdfAttachment?.content ?? "");
    const filename = String(pdfAttachment?.filename ?? `${filenameBase}.pdf`);
    if (!content) {
      return NextResponse.json({ error: "PDF 附件尚未產生，請重新查詢後再寄送。" }, { status: 400 });
    }
    attachments.push({
      filename,
      content: Buffer.from(content, "base64"),
      contentType: "application/pdf",
    });
  } else {
    return NextResponse.json({ error: "附件格式僅支援 excel、word、pdf。" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: company!.smtpHost!,
    port: smtpPort,
    secure: company!.smtpSecure,
    auth: { user: company!.smtpUser!, pass: company!.smtpPassword! },
  });

  const senderName = String(company!.smtpFromName || company!.name || "ERP AI 資料助手").replace(/"/g, "'");
  await transporter.sendMail({
    from: `"${senderName}" <${company!.smtpFromEmail}>`,
    to,
    subject: `ERP AI 報表 - ${result.title}`,
    html,
    attachments,
  });

  return NextResponse.json({ ok: true, sentTo: to, format: selectedFormat });
});
