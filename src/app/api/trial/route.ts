import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TRIAL_DAYS = 2;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ status: "no_session" });
  }

  // 超級管理員跳過試用檢查
  if (session.user.isSuperAdmin) {
    return NextResponse.json({ status: "paid" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { trialStart: true, isPaid: true, paymentType: true, subscriptionEnd: true, tenantId: true },
  });

  // 獲取系統中所有租戶總數
  const tenantCount = await prisma.tenant.count();

  if (!user) {
    return NextResponse.json({ status: "no_session" });
  }

  // 永久授權
  if (user.isPaid && user.paymentType === "ONCE") {
    return NextResponse.json({ status: "paid", paymentType: "ONCE", tenantCount });
  }

  // 月付訂閱
  if (user.isPaid && user.paymentType === "MONTHLY") {
    const subEnd = user.subscriptionEnd ? user.subscriptionEnd.getTime() : 0;
    const now = Date.now();
    if (now < subEnd) {
      return NextResponse.json({ status: "paid", paymentType: "MONTHLY", subscriptionRemainMs: subEnd - now, tenantCount });
    }
    // 到期立即鎖定該租戶所有帳號
    if (user.tenantId) {
      await prisma.user.updateMany({ where: { tenantId: user.tenantId }, data: { isActive: false } });
    } else {
      await prisma.user.update({ where: { id: session.user.id }, data: { isActive: false } });
    }
    return NextResponse.json({ status: "locked" });
  }

  // 舊版已付款（兼容）
  if (user.isPaid) {
    return NextResponse.json({ status: "paid", paymentType: "ONCE", tenantCount });
  }

  // 試用期
  const startTs = user.trialStart.getTime();
  const expireTs = startTs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (now >= expireTs) {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({ status: "trial", remainMs: expireTs - now, tenantCount });
}
