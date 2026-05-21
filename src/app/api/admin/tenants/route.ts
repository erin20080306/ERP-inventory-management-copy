import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requireAuth, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");

  const [tenants, users, loginStats, auditStats, recentLogins, securityEvents] = await Promise.all([
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
    // 最近 50 筆安全事件（SQL 注入偵測）
    prisma.auditLog.findMany({
      take: 50,
      where: { action: "sql_injection_blocked" },
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        module: true,
        detail: true,
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
      lastLoginIp: u.lastLoginIp,
      registrationIp: (u as any).registrationIp,
      createdAt: u.createdAt,
      tenantId: u.tenantId,
      tenantName: u.tenant?.name ?? null,
      loginCount: loginMap[u.id] ?? 0,
      actionCount: auditMap[u.id] ?? 0,
    })),
    recentLogins,
    securityEvents,
    totalTenants: tenants.length,
    totalUsers: users.length,
  });
});

export const DELETE = apiHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");

  // 計算登入次數
  const loginStats = await prisma.loginLog.groupBy({
    by: ["userId"],
    where: { success: true },
    _count: true,
  });
  const loginMap = Object.fromEntries(loginStats.map((l) => [l.userId, l._count]));

  // 找出所有租戶
  const tenants = await prisma.tenant.findMany({
    include: { users: true },
  });

  let deletedCount = 0;
  const deletedTenantIds: string[] = [];
  for (const tenant of tenants) {
    // 跳過超級管理員租戶（tenantId 為 null）
    if (!tenant.id) continue;

    // 檢查該租戶的所有用戶是否都沒有登入過
    const allUsersNeverLoggedIn = tenant.users.every((u) => {
      // 跳過超級管理員
      if ((u as any).isSuperAdmin) return true;
      // 檢查登入次數是否為 0
      return (loginMap[u.id] || 0) === 0;
    });

    // 如果租戶有非超級管理員用戶且所有用戶都沒登入過，則刪除
    if (tenant.users.length > 0 && allUsersNeverLoggedIn) {
      try {
        await prisma.tenant.delete({
          where: { id: tenant.id },
        });
        deletedCount++;
        deletedTenantIds.push(tenant.name || tenant.id);
      } catch (error) {
        console.error(`刪除租戶失敗: ${tenant.name}`, error);
      }
    }
  }

  return NextResponse.json({ deletedCount, deletedTenantIds });
});
