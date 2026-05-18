import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "用戶不存在" }, { status: 404 });
  }

  // Revoke paid status, keep trialStart unchanged (still based on registration date)
  if (user.tenantId) {
    await prisma.user.updateMany({
      where: { tenantId: user.tenantId },
      data: { isPaid: false, paymentType: null, subscriptionEnd: null, isActive: true },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { isPaid: false, paymentType: null, subscriptionEnd: null, isActive: true },
    });
  }

  return NextResponse.json({ ok: true });
}
