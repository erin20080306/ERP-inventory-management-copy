import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 此 API 僅用於查詢付款狀態，不會自動啟用
// 啟用只能透過：1) PayPal Webhook 自動驗證  2) 管理員後台手動設定
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPaid: true },
  });

  if (user?.isPaid) {
    return NextResponse.json({ status: "paid" });
  }

  return NextResponse.json({ status: "pending", message: "付款尚未確認，請稍候或聯繫管理員" });
}
