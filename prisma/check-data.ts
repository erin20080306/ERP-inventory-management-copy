import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("→ 檢查資料庫資料狀態...\n");

  const [
    tenantCount,
    userCount,
    productCount,
    customerCount,
    supplierCount,
    salesCount,
    purchaseCount,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.product.count(),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.salesOrder.count(),
    prisma.purchaseOrder.count(),
  ]);

  console.log(`租戶數量：${tenantCount}`);
  console.log(`用戶數量：${userCount}`);
  console.log(`商品數量：${productCount}`);
  console.log(`客戶數量：${customerCount}`);
  console.log(`供應商數量：${supplierCount}`);
  console.log(`銷售訂單數量：${salesCount}`);
  console.log(`採購訂單數量：${purchaseCount}`);

  // 檢查銷售訂單狀態
  const salesStatuses = await prisma.salesOrder.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("\n銷售訂單狀態分佈：");
  for (const s of salesStatuses) {
    console.log(`  ${s.status}: ${s._count} 筆`);
  }

  // 檢查採購訂單狀態
  const purchaseStatuses = await prisma.purchaseOrder.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("\n採購訂單狀態分佈：");
  for (const s of purchaseStatuses) {
    console.log(`  ${s.status}: ${s._count} 筆`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
