import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "舊版用戶層級開通已停用，請使用公司授權後台" }, { status: 410 });
}
