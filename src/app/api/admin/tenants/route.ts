import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requireAuth, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");

  const [tenants, users, loginStats, auditStats, recentLogins, securityEvents] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        _count: { select: { users: true } },
        users: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { username: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      include: {
        tenant: { select: { name: true } },
        createdByUser: { select: { username: true, name: true } },
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
    tenants: tenants.map((t) => {
      const owner = t.users?.[0] ?? null;
      return {
        id: t.id,
        name: t.name,
        createdAt: t.createdAt,
        userCount: t._count.users,
        ownerUsername: owner?.username ?? null,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
      };
    }),
    users: users.map((u: any) => ({
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
      tenantName: (u as any).tenant?.name ?? null,
      createdByUsername: (u as any).createdByUser?.username ?? null,
      createdByName: (u as any).createdByUser?.name ?? null,
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
  const skippedTenantIds: string[] = [];
  const debugLogs: string[] = [];
  
  for (const tenant of tenants) {
    // 跳過超級管理員租戶（tenantId 為 null）
    if (!tenant.id) continue;

    // 檢查該租戶的用戶登入狀態
    let allUsersNeverLoggedIn = true;
    let hasNonSuperAdminUser = false;
    const userLoginInfo: string[] = [];
    
    if (tenant.users.length === 0) {
      // 沒有用戶的租戶直接刪除
      debugLogs.push(`租戶 ${tenant.name} (${tenant.id}) 沒有用戶，準備刪除`);
    } else {
      for (const u of tenant.users) {
        const loginCount = loginMap[u.id] || 0;
        const isSuper = (u as any).isSuperAdmin;
        userLoginInfo.push(`${u.username} (superAdmin: ${isSuper}, loginCount: ${loginCount})`);
        
        if (isSuper) {
          // 超級管理員不影響判斷
          continue;
        }
        hasNonSuperAdminUser = true;
        if (loginCount > 0) {
          allUsersNeverLoggedIn = false;
        }
      }
      debugLogs.push(`租戶 ${tenant.name} (${tenant.id}) 用戶資訊: ${userLoginInfo.join(", ")}`);
      debugLogs.push(`hasNonSuperAdminUser: ${hasNonSuperAdminUser}, allUsersNeverLoggedIn: ${allUsersNeverLoggedIn}`);
    }

    // 刪除條件：沒有用戶 或 所有非超級管理員用戶都沒登入過
    const shouldDelete = !hasNonSuperAdminUser || allUsersNeverLoggedIn;
    debugLogs.push(`租戶 ${tenant.name} shouldDelete: ${shouldDelete}`);
    
    if (shouldDelete) {
      try {
        debugLogs.push(`正在刪除租戶: ${tenant.name} (${tenant.id})`);
        
        // 使用事務刪除租戶及其所有關聯資料
        await prisma.$transaction(async (tx) => {
          const userIds = tenant.users.map(u => u.id);

          // 先清除 createdByUserId 外鍵引用（避免自引用約束）
          await tx.user.updateMany({
            where: { createdByUserId: { in: userIds } },
            data: { createdByUserId: null },
          });

          // 刪除用戶角色、登入日誌、稽核日誌
          await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
          await tx.loginLog.deleteMany({ where: { userId: { in: userIds } } });
          await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });

          // 刪除所有相關資料
          await tx.taxRate.deleteMany({ where: { tenantId: tenant.id } });
          await tx.productCategory.deleteMany({ where: { tenantId: tenant.id } });
          await tx.productUnit.deleteMany({ where: { tenantId: tenant.id } });
          await tx.warehouse.deleteMany({ where: { tenantId: tenant.id } });
          await tx.inventoryStock.deleteMany({ where: { tenantId: tenant.id } });
          await tx.inventoryTransaction.deleteMany({ where: { tenantId: tenant.id } });
          await tx.stockAdjustment.deleteMany({ where: { tenantId: tenant.id } });
          await tx.stockTransfer.deleteMany({ where: { tenantId: tenant.id } });
          await tx.product.deleteMany({ where: { tenantId: tenant.id } });
          await tx.customer.deleteMany({ where: { tenantId: tenant.id } });
          await tx.supplier.deleteMany({ where: { tenantId: tenant.id } });
          await tx.quotation.deleteMany({ where: { tenantId: tenant.id } });
          await tx.salesOrder.deleteMany({ where: { tenantId: tenant.id } });
          await tx.purchaseOrder.deleteMany({ where: { tenantId: tenant.id } });
          await tx.salesReturn.deleteMany({ where: { tenantId: tenant.id } });
          await tx.purchaseReturn.deleteMany({ where: { tenantId: tenant.id } });
          await tx.chartOfAccount.deleteMany({ where: { tenantId: tenant.id } });
          await tx.journalEntry.deleteMany({ where: { tenantId: tenant.id } });
          await tx.accountsReceivable.deleteMany({ where: { tenantId: tenant.id } });
          await tx.receivePayment.deleteMany({ where: { tenantId: tenant.id } });
          await tx.accountsPayable.deleteMany({ where: { tenantId: tenant.id } });
          await tx.supplierPayment.deleteMany({ where: { tenantId: tenant.id } });
          await tx.cashAccount.deleteMany({ where: { tenantId: tenant.id } });
          await tx.bankAccount.deleteMany({ where: { tenantId: tenant.id } });
          await tx.invoice.deleteMany({ where: { tenantId: tenant.id } });
          await tx.discountNote.deleteMany({ where: { tenantId: tenant.id } });
          await tx.invoiceTrack.deleteMany({ where: { tenantId: tenant.id } });
          await tx.noteReceivable.deleteMany({ where: { tenantId: tenant.id } });
          await tx.notePayable.deleteMany({ where: { tenantId: tenant.id } });
          await tx.companySetting.deleteMany({ where: { tenantId: tenant.id } });
          await tx.numberSequence.deleteMany({ where: { tenantId: tenant.id } });
          await tx.department.deleteMany({ where: { tenantId: tenant.id } });
          await tx.employee.deleteMany({ where: { tenantId: tenant.id } });
          await tx.payrollPeriod.deleteMany({ where: { tenantId: tenant.id } });
          await tx.fixedAsset.deleteMany({ where: { tenantId: tenant.id } });

          // 刪除用戶
          await tx.user.deleteMany({ where: { tenantId: tenant.id } });

          // 最後刪除租戶
          await tx.tenant.delete({ where: { id: tenant.id } });
        }, { timeout: 30000 });

        deletedCount++;
        deletedTenantIds.push(tenant.name || tenant.id);
        debugLogs.push(`✓ 成功刪除租戶: ${tenant.name}`);
      } catch (error: any) {
        const errMsg = error?.message || String(error);
        debugLogs.push(`✗ 刪除租戶失敗: ${tenant.name} - 錯誤: ${errMsg}`);
        skippedTenantIds.push(`${tenant.name} (錯誤: ${errMsg.slice(0, 100)})`);
      }
    } else {
      skippedTenantIds.push(`${tenant.name} (有登入紀錄)`);
    }
  }

  return NextResponse.json({ deletedCount, deletedTenantIds, skippedTenantIds, debugLogs });
});
