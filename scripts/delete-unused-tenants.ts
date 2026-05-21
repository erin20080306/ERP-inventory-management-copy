import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("開始刪除未登入過的租戶...");

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

    console.log(`檢查租戶: ${tenant.name || tenant.id}`);
    console.log(`  用戶數: ${tenant.users.length}`);
    console.log(`  用戶列表: ${tenant.users.map(u => `${u.username} (登入: ${loginMap[u.id] || 0}, 超級管理員: ${(u as any).isSuperAdmin})`).join(', ')}`);

    // 檢查該租戶的所有用戶是否都沒有登入過
    const allUsersNeverLoggedIn = tenant.users.every((u) => {
      // 跳過超級管理員
      if ((u as any).isSuperAdmin) return true;
      // 檢查登入次數是否為 0
      return (loginMap[u.id] || 0) === 0;
    });

    console.log(`  所有用戶未登入: ${allUsersNeverLoggedIn}`);

    // 如果租戶有非超級管理員用戶且所有用戶都沒登入過，則刪除
    if (tenant.users.length > 0 && allUsersNeverLoggedIn) {
      try {
        // 使用事務刪除租戶及其所有關聯資料
        await prisma.$transaction(async (tx) => {
          // 刪除該租戶的所有關聯資料（按依賴順序）
          const userIds = tenant.users.map(u => u.id);

          // 刪除用戶角色
          await tx.userRole.deleteMany({
            where: { userId: { in: userIds } },
          });

          // 刪除登入日誌
          await tx.loginLog.deleteMany({
            where: { userId: { in: userIds } },
          });

          // 刪除稽核日誌
          await tx.auditLog.deleteMany({
            where: { userId: { in: userIds } },
          });

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
          await tx.user.deleteMany({
            where: { tenantId: tenant.id },
          });

          // 最後刪除租戶
          await tx.tenant.delete({
            where: { id: tenant.id },
          });
        });

        deletedCount++;
        deletedTenantIds.push(tenant.name || tenant.id);
        console.log(`✓ 已刪除租戶: ${tenant.name || tenant.id}`);
      } catch (error) {
        console.error(`✗ 刪除租戶失敗: ${tenant.name}`, error);
      }
    }
  }

  console.log(`\n完成！共刪除 ${deletedCount} 個租戶`);
  console.log("刪除的租戶:", deletedTenantIds);
}

main()
  .then(() => {
    console.log("腳本執行完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("腳本執行失敗:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
