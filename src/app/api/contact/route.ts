import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    const res = await fetch("https://formsubmit.co/ajax/erin20080306@gmail.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        _subject: `ERP諮詢 - ${data.name || "未填姓名"} (${data.plan || "未選方案"})`,
        _template: "table",
        _captcha: "false",
        姓名: data.name || "",
        Email: data.email || "",
        "Line ID": data.lineId || "",
        使用平台: data.platform || "",
        資料格式: data.dataFormat || "",
        需求: data.problem || "",
        方案: data.plan || "",
        備註: data.notes || "",
      }),
    });

    const result = await res.json();
    
    if (result.success) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "FormSubmit error", detail: result }, { status: 500 });
  } catch (error: any) {
    console.error("Contact form error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
