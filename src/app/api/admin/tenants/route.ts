import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requireAuth, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");

  const [tenants, users, loginStats, auditStats, recentLogins] = await Promise.all([
    prisma.tenant.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      include: {
        tenant: { select: { name: true } },
        _count: { select: { loginLogs: true, auditLogs: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // 每位用戶的成功登入次數
    prisma.loginLog.groupBy({
      by: ["userId"],
      where: { success: true },
      _count: true,
    }),
    // 每位用戶的操作次數
    prisma.auditLog.groupBy({
      by: ["userId"],
      _count: true,
    }),
    // 最近 50 筆登入紀錄
    prisma.loginLog.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        username: true,
        success: true,
        ip: true,
        createdAt: true,
      },
    }),
  ]);

  const loginMap = Object.fromEntries(loginStats.map((l) => [l.userId, l._count]));
  const auditMap = Object.fromEntries(auditStats.map((a) => [a.userId, a._count]));

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      userCount: t._count.users,
    })),
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      isSuperAdmin: (u as any).isSuperAdmin,
      isPaid: u.isPaid,
      paymentType: u.paymentType,
      subscriptionEnd: u.subscriptionEnd,
      trialStart: u.trialStart,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      tenantId: u.tenantId,
      tenantName: u.tenant?.name ?? null,
      loginCount: loginMap[u.id] ?? 0,
      actionCount: auditMap[u.id] ?? 0,
    })),
    recentLogins,
    totalTenants: tenants.length,
    totalUsers: users.length,
  });
});
