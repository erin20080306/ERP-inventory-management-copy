import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SUPER_ADMIN_PASSWORD = "qwe811122";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { password, userId } = await req.json();
  if (password !== SUPER_ADMIN_PASSWORD) {
    return NextResponse.json({ error: "密碼錯誤" }, { status: 403 });
  }

  // If userId is provided (from admin backend), use that user; otherwise use current user
  const targetUserId = userId || session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { tenantId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "用戶不存在" }, { status: 404 });
  }

  // Activate all users in the same tenant
  if (user.tenantId) {
    await prisma.user.updateMany({
      where: { tenantId: user.tenantId },
      data: { isPaid: true, paymentType: "ONCE", isActive: true },
    });
  } else {
    await prisma.user.update({
      where: { id: targetUserId },
      data: { isPaid: true, paymentType: "ONCE", isActive: true },
    });
  }

  return NextResponse.json({ ok: true });
}
