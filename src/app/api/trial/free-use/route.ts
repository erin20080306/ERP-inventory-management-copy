import { NextResponse } from "next/server";

// 舊版曾把管理者密碼寫在程式內，這會讓任何取得原始碼的人繞過授權。
// 免費開通流程已永久停用，所有開通一律走管理後台的租戶授權 API。
export async function POST() {
  return NextResponse.json({ error: "此開通方式已停用，請聯絡艾琳設計" }, { status: 410 });
}
