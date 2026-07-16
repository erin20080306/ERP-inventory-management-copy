import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLicenseAccessForUser } from "@/lib/license";

// 相容舊客戶端的查詢端點；不接受任何付款或自動開通資料。
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  return NextResponse.json(await getLicenseAccessForUser(session.user.id));
}
