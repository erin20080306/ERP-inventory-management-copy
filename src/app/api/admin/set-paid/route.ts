import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { userId, isPaid } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
  }

  // Get user's tenantId to update all users in the same tenant
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "用戶不存在" }, { status: 404 });
  }

  // Update all users in the same tenant
  if (user.tenantId) {
    await prisma.user.updateMany({
      where: { tenantId: user.tenantId },
      data: { isPaid, paymentType: isPaid ? "ONCE" : null, isActive: true },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { isPaid, paymentType: isPaid ? "ONCE" : null, isActive: true },
    });
  }

  return NextResponse.json({ ok: true });
}
