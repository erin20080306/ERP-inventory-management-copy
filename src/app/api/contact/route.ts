import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    // Send via FormSubmit.co from server side (no CORS issues)
    const res = await fetch("https://formsubmit.co/ajax/erin20080306@gmail.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        _subject: "ERP系統諮詢表單",
        _template: "table",
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

    // Fallback: try alternative endpoint
    const res2 = await fetch("https://formsubmit.co/ajax/erin20080306@gmail.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        _subject: "ERP系統諮詢表單",
        name: data.name || "",
        email: data.email || "",
        lineId: data.lineId || "",
        platform: data.platform || "",
        dataFormat: data.dataFormat || "",
        problem: data.problem || "",
        plan: data.plan || "",
        notes: data.notes || "",
      }).toString(),
    });

    const result2 = await res2.json();
    return NextResponse.json({ ok: result2.success || false, detail: result2 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
