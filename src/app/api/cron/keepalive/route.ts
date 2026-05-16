import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 定期 ping DB 防止 Neon free tier 冷啟動
// 配合 Vercel Cron 或外部 cron 服務每 4 分鐘呼叫一次
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
