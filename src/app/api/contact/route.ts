import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    const formData = new FormData();
    formData.append("_subject", `ERP諮詢 - ${data.name || "未填姓名"}`);
    formData.append("_template", "table");
    formData.append("_captcha", "false");
    formData.append("姓名", data.name || "");
    formData.append("Email", data.email || "");
    formData.append("Line ID", data.lineId || "");
    formData.append("使用平台", data.platform || "");
    formData.append("資料格式", data.dataFormat || "");
    formData.append("需求", data.problem || "");
    formData.append("方案", data.plan || "");
    formData.append("備註", data.notes || "");

    const res = await fetch("https://formsubmit.co/ajax/erin20080306@gmail.com", {
      method: "POST",
      headers: {
        "Accept": "application/json",
      },
      body: formData,
    });

    const text = await res.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid response", detail: text }, { status: 500 });
    }

    if (result.success === "true" || result.success === true) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "FormSubmit rejected", detail: result }, { status: 500 });
  } catch (error: any) {
    console.error("Contact form error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
