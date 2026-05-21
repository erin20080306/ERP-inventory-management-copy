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

  // 取得當前超級管理員的租戶 ID，絕不刪除
  const superAdminTenantId = session.user.tenantId;
  debugLogs.push(`當前超級管理員租戶: ${superAdminTenantId}`);
  
  for (const tenant of tenants) {
    if (!tenant.id) continue;

    // === 保護規則 1：絕不刪除超級管理員所在的租戶 ===
    if (tenant.id === superAdminTenantId) {
      skippedTenantIds.push(`${tenant.name} (超級管理員所在租戶，受保護)`);
      debugLogs.push(`租戶 ${tenant.name} 跳過：超級管理員所在租戶`);
      continue;
    }

    // === 保護規則 2：租戶內有超級管理員用戶，不刪除 ===
    const hasSuperAdmin = tenant.users.some((u: any) => u.isSuperAdmin);
    if (hasSuperAdmin) {
      skippedTenantIds.push(`${tenant.name} (含超級管理員用戶，受保護)`);
      debugLogs.push(`租戶 ${tenant.name} 跳過：含超級管理員用戶`);
      continue;
    }

    // === 保護規則 3：租戶有任何用戶曾經登入過，不刪除 ===
    const userLoginInfo: string[] = [];
    let anyUserLoggedIn = false;
    for (const u of tenant.users) {
      const loginCount = loginMap[u.id] || 0;
      userLoginInfo.push(`${u.username} (loginCount: ${loginCount})`);
      if (loginCount > 0) {
        anyUserLoggedIn = true;
      }
    }

    if (anyUserLoggedIn) {
      const loggedInUsers = userLoginInfo.filter((u) => !u.includes("loginCount: 0"));
      skippedTenantIds.push(`${tenant.name} (有用戶已登入: ${loggedInUsers.slice(0, 2).join(", ")}${loggedInUsers.length > 2 ? "..." : ""})`);
      debugLogs.push(`租戶 ${tenant.name} 跳過：有用戶已登入 - ${userLoginInfo.join(", ")}`);
      continue;
    }

    // === 保護規則 4：租戶有業務資料（訂單、傳票等），不刪除 ===
    const [salesCount, purchaseCount, quotationCount, journalCount, invoiceCount] = await Promise.all([
      prisma.salesOrder.count({ where: { tenantId: tenant.id } }),
      prisma.purchaseOrder.count({ where: { tenantId: tenant.id } }),
      prisma.quotation.count({ where: { tenantId: tenant.id } }),
      prisma.journalEntry.count({ where: { tenantId: tenant.id } }),
      prisma.invoice.count({ where: { tenantId: tenant.id } }),
    ]);
    const totalBusinessData = salesCount + purchaseCount + quotationCount + journalCount + invoiceCount;

    if (totalBusinessData > 0) {
      skippedTenantIds.push(`${tenant.name} (有業務資料: 銷${salesCount}/購${purchaseCount}/報${quotationCount}/傳${journalCount}/票${invoiceCount})`);
      debugLogs.push(`租戶 ${tenant.name} 跳過：有業務資料 ${totalBusinessData} 筆`);
      continue;
    }

    // 通過所有檢查：無超級管理員、無登入、無業務資料 → 可刪除
    const shouldDelete = true;
    debugLogs.push(`租戶 ${tenant.name} (${tenant.id}) 用戶: ${userLoginInfo.join(", ") || "無"}, 業務資料: 0 → 準備刪除`);
    
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

          // === 先刪除所有明細/子表（有外鍵引用父表的） ===

          // 訂單明細項目（引用 Product）
          const salesOrderIds = (await tx.salesOrder.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);
          const purchaseOrderIds = (await tx.purchaseOrder.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);
          const quotationIds = (await tx.quotation.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);
          const salesReturnIds = (await tx.salesReturn.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);
          const purchaseReturnIds = (await tx.purchaseReturn.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);
          const invoiceIds = (await tx.invoice.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);
          const journalEntryIds = (await tx.journalEntry.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);
          const cashAccountIds = (await tx.cashAccount.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);
          const bankAccountIds = (await tx.bankAccount.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map(o => o.id);

          // 刪除明細項目
          if (salesOrderIds.length) await tx.salesOrderItem.deleteMany({ where: { orderId: { in: salesOrderIds } } });
          if (purchaseOrderIds.length) await tx.purchaseOrderItem.deleteMany({ where: { orderId: { in: purchaseOrderIds } } });
          if (quotationIds.length) await tx.quotationItem.deleteMany({ where: { quotationId: { in: quotationIds } } });
          if (salesReturnIds.length) await tx.salesReturnItem.deleteMany({ where: { returnId: { in: salesReturnIds } } });
          if (purchaseReturnIds.length) await tx.purchaseReturnItem.deleteMany({ where: { returnId: { in: purchaseReturnIds } } });
          if (invoiceIds.length) await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
          if (journalEntryIds.length) await tx.journalEntryLine.deleteMany({ where: { entryId: { in: journalEntryIds } } });
          if (cashAccountIds.length) await tx.cashTransaction.deleteMany({ where: { cashAccountId: { in: cashAccountIds } } });
          if (bankAccountIds.length) await tx.bankTransaction.deleteMany({ where: { bankAccountId: { in: bankAccountIds } } });

          // === 刪除主表（按照正確順序） ===
          await tx.discountNote.deleteMany({ where: { tenantId: tenant.id } });
          await tx.receivePayment.deleteMany({ where: { tenantId: tenant.id } });
          await tx.supplierPayment.deleteMany({ where: { tenantId: tenant.id } });
          await tx.noteReceivable.deleteMany({ where: { tenantId: tenant.id } });
          await tx.notePayable.deleteMany({ where: { tenantId: tenant.id } });
          await tx.accountsReceivable.deleteMany({ where: { tenantId: tenant.id } });
          await tx.accountsPayable.deleteMany({ where: { tenantId: tenant.id } });
          await tx.salesReturn.deleteMany({ where: { tenantId: tenant.id } });
          await tx.purchaseReturn.deleteMany({ where: { tenantId: tenant.id } });
          await tx.salesOrder.deleteMany({ where: { tenantId: tenant.id } });
          await tx.purchaseOrder.deleteMany({ where: { tenantId: tenant.id } });
          await tx.quotation.deleteMany({ where: { tenantId: tenant.id } });
          await tx.invoice.deleteMany({ where: { tenantId: tenant.id } });
          await tx.journalEntry.deleteMany({ where: { tenantId: tenant.id } });
          await tx.chartOfAccount.deleteMany({ where: { tenantId: tenant.id } });
          await tx.inventoryTransaction.deleteMany({ where: { tenantId: tenant.id } });
          await tx.inventoryStock.deleteMany({ where: { tenantId: tenant.id } });
          await tx.stockAdjustment.deleteMany({ where: { tenantId: tenant.id } });
          await tx.stockTransfer.deleteMany({ where: { tenantId: tenant.id } });
          await tx.product.deleteMany({ where: { tenantId: tenant.id } });
          await tx.productCategory.deleteMany({ where: { tenantId: tenant.id } });
          await tx.productUnit.deleteMany({ where: { tenantId: tenant.id } });
          await tx.taxRate.deleteMany({ where: { tenantId: tenant.id } });
          await tx.customer.deleteMany({ where: { tenantId: tenant.id } });
          await tx.supplier.deleteMany({ where: { tenantId: tenant.id } });
          await tx.warehouse.deleteMany({ where: { tenantId: tenant.id } });
          await tx.cashAccount.deleteMany({ where: { tenantId: tenant.id } });
          await tx.bankAccount.deleteMany({ where: { tenantId: tenant.id } });
          await tx.invoiceTrack.deleteMany({ where: { tenantId: tenant.id } });
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
    }
  }

  return NextResponse.json({ deletedCount, deletedTenantIds, skippedTenantIds, debugLogs });
});
