import { NextRequest, NextResponse } from "next/server";
import { processDueEInvoiceEvents } from "@/lib/e-invoice";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  try {
    const results = await processDueEInvoiceEvents(20);
    return NextResponse.json({ ok: true, processed: results.length, time: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? "電子發票重送失敗" }, { status: 500 });
  }
}
