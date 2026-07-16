import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 定期 ping DB 防止 Neon free tier 冷啟動
// 配合 Vercel Cron 或外部 cron 服務每 4 分鐘呼叫一次
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
