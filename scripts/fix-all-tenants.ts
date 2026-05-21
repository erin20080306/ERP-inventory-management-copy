import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 完整 209 個會計科目（來自有 209 個科目的租戶）
// 先從資料庫取得完整科目列表，再補齊缺少的

async function main() {
  const ADMIN_TENANT = "cmpfe2yjj000415ivou4lo2qi";

  // ==========================================
  // 1. 為超級管理員租戶補商品資料
  // ==========================================
  console.log("→ 1. 為超級管理員租戶補充商品資料...");

  // 稅率
  let tax5 = await prisma.taxRate.findUnique({ where: { tenantId_code: { tenantId: ADMIN_TENANT, code: "VAT5" } } });
  if (!tax5) {
    tax5 = await prisma.taxRate.create({ data: { tenantId: ADMIN_TENANT, code: "VAT5", name: "營業稅 5%", rate: 0.05, region: "TW" } });
  }

  // 倉庫
  let wh = await prisma.warehouse.findFirst({ where: { tenantId: ADMIN_TENANT } });
  if (!wh) {
    wh = await prisma.warehouse.create({ data: { tenantId: ADMIN_TENANT, code: "WH-MAIN", name: "主倉庫" } });
  }

  // 商品分類
  let cat = await prisma.productCategory.findFirst({ where: { tenantId: ADMIN_TENANT } });
  if (!cat) {
    cat = await prisma.productCategory.create({ data: { tenantId: ADMIN_TENANT, code: "GEN", name: "一般商品" } });
  }

  // 單位
  let unit = await prisma.productUnit.findFirst({ where: { tenantId: ADMIN_TENANT } });
  if (!unit) {
    unit = await prisma.productUnit.create({ data: { tenantId: ADMIN_TENANT, code: "PCS", name: "個" } });
  }

  // 範例商品
  const products = [
    { sku: "P001", name: "筆記型電腦", costPrice: 18000, salePrice: 25000, safetyStock: 5 },
    { sku: "P002", name: "無線滑鼠", costPrice: 200, salePrice: 399, safetyStock: 20 },
    { sku: "P003", name: "機械鍵盤", costPrice: 1500, salePrice: 2500, safetyStock: 10 },
    { sku: "P004", name: "27吋螢幕", costPrice: 6000, salePrice: 8900, safetyStock: 5 },
    { sku: "P005", name: "USB-C 集線器", costPrice: 350, salePrice: 690, safetyStock: 30 },
    { sku: "P006", name: "辦公椅", costPrice: 3000, salePrice: 4500, safetyStock: 8 },
    { sku: "P007", name: "A4 影印紙 (箱)", costPrice: 450, salePrice: 650, safetyStock: 50 },
    { sku: "P008", name: "網路攝影機", costPrice: 800, salePrice: 1290, safetyStock: 15 },
    { sku: "P009", name: "外接硬碟 1TB", costPrice: 1200, salePrice: 1890, safetyStock: 10 },
    { sku: "P010", name: "藍牙耳機", costPrice: 600, salePrice: 990, safetyStock: 20 },
  ];

  for (const p of products) {
    let prod = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: ADMIN_TENANT, sku: p.sku } } });
    if (!prod) {
      prod = await prisma.product.create({
        data: { tenantId: ADMIN_TENANT, ...p, categoryId: cat.id, unitId: unit.id, taxRateId: tax5.id },
      });
      console.log(`  建立商品: ${p.name}`);
    }
    const stockEx = await prisma.inventoryStock.findUnique({ where: { productId_warehouseId: { productId: prod.id, warehouseId: wh.id } } });
    if (!stockEx) {
      await prisma.inventoryStock.create({ data: { tenantId: ADMIN_TENANT, productId: prod.id, warehouseId: wh.id, quantity: 50 } });
    }
  }

  // 客戶
  const customers = [
    { code: "C001", companyName: "台北科技有限公司", taxId: "11111111", contactName: "陳先生", phone: "02-2771-1111", email: "taipei@example.com" },
    { code: "C002", companyName: "高雄貿易股份有限公司", taxId: "22222222", contactName: "林小姐", phone: "07-3321-2222", email: "kaohsiung@example.com" },
    { code: "C003", companyName: "台中電子有限公司", taxId: "33333333", contactName: "王經理", phone: "04-2255-3333", email: "taichung@example.com" },
  ];
  for (const c of customers) {
    const ex = await prisma.customer.findUnique({ where: { tenantId_code: { tenantId: ADMIN_TENANT, code: c.code } } });
    if (!ex) {
      await prisma.customer.create({ data: { tenantId: ADMIN_TENANT, ...c } });
      console.log(`  建立客戶: ${c.companyName}`);
    }
  }

  // 供應商
  const suppliers = [
    { code: "S001", companyName: "新竹零件供應有限公司", taxId: "44444444", contactName: "張經理", phone: "03-5678-4444", email: "hsinchu@example.com" },
    { code: "S002", companyName: "桃園物流股份有限公司", taxId: "55555555", contactName: "黃小姐", phone: "03-3456-5555", email: "taoyuan@example.com" },
  ];
  for (const s of suppliers) {
    const ex = await prisma.supplier.findUnique({ where: { tenantId_code: { tenantId: ADMIN_TENANT, code: s.code } } });
    if (!ex) {
      await prisma.supplier.create({ data: { tenantId: ADMIN_TENANT, ...s } });
      console.log(`  建立供應商: ${s.companyName}`);
    }
  }

  // 現金/銀行帳戶
  const ca = await prisma.cashAccount.findFirst({ where: { tenantId: ADMIN_TENANT } });
  if (!ca) {
    await prisma.cashAccount.create({ data: { tenantId: ADMIN_TENANT, code: "CASH-01", name: "現金", balance: 0 } });
    console.log("  建立現金帳戶");
  }
  const ba = await prisma.bankAccount.findFirst({ where: { tenantId: ADMIN_TENANT } });
  if (!ba) {
    await prisma.bankAccount.create({ data: { tenantId: ADMIN_TENANT, code: "BANK-01", name: "公司銀行帳戶", bankName: "台灣銀行", accountNumber: "000-000-000000" } });
    console.log("  建立銀行帳戶");
  }

  console.log("✅ 超級管理員商品資料補充完成");

  // ==========================================
  // 2. 從有 209 科目的租戶取得完整科目列表
  // ==========================================
  console.log("\n→ 2. 為所有租戶補齊 209 個會計科目...");

  // 找一個有 209 個科目的租戶作為參考
  const refTenants = await prisma.$queryRaw<{ tenantId: string; cnt: bigint }[]>`
    SELECT "tenantId", count(*) as cnt FROM "ChartOfAccount" 
    GROUP BY "tenantId" HAVING count(*) >= 209 LIMIT 1
  `;

  if (refTenants.length === 0) {
    console.log("  找不到有 209 個科目的參考租戶，跳過");
    return;
  }

  const refTenantId = refTenants[0].tenantId;
  console.log(`  參考租戶: ${refTenantId}`);

  // 取得完整科目列表
  const refAccounts = await prisma.chartOfAccount.findMany({
    where: { tenantId: refTenantId },
    orderBy: { code: "asc" },
  });
  console.log(`  參考科目數: ${refAccounts.length}`);

  // 取得所有租戶
  const allTenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`  總租戶數: ${allTenants.length}`);

  let upgraded = 0;
  for (const tenant of allTenants) {
    const currentCount = await prisma.chartOfAccount.count({ where: { tenantId: tenant.id } });
    if (currentCount >= 209) continue; // 已經齊全

    // 取得現有科目代碼
    const existing = await prisma.chartOfAccount.findMany({
      where: { tenantId: tenant.id },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((a) => a.code));

    // 找出缺少的科目
    const missing = refAccounts.filter((a) => !existingCodes.has(a.code));
    if (missing.length === 0) continue;

    // 批次建立缺少的科目
    await prisma.chartOfAccount.createMany({
      data: missing.map((a) => ({
        tenantId: tenant.id,
        code: a.code,
        name: a.name,
        type: a.type as any,
      })),
      skipDuplicates: true,
    });

    // 更新 parentId
    const all = await prisma.chartOfAccount.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, code: true },
    });
    const idMap = Object.fromEntries(all.map((a) => [a.code, a.id]));

    // 從參考租戶取得 parent 關係
    const refWithParent = await prisma.chartOfAccount.findMany({
      where: { tenantId: refTenantId, parentId: { not: null } },
      select: { code: true, parent: { select: { code: true } } },
    });

    const updates = refWithParent.filter(
      (a) => a.parent && idMap[a.code] && idMap[a.parent.code]
    );

    if (updates.length > 0) {
      const cases = updates
        .map((a) => `WHEN id = '${idMap[a.code]}' THEN '${idMap[a.parent!.code]}'`)
        .join(" ");
      const ids = updates.map((a) => `'${idMap[a.code]}'`).join(",");
      await prisma.$executeRawUnsafe(
        `UPDATE "ChartOfAccount" SET "parentId" = CASE ${cases} END WHERE id IN (${ids})`
      );
    }

    const newCount = await prisma.chartOfAccount.count({ where: { tenantId: tenant.id } });
    console.log(`  ${tenant.name} (${tenant.id}): ${currentCount} → ${newCount} (+${missing.length})`);
    upgraded++;
  }

  console.log(`\n✅ 完成！共升級 ${upgraded} 個租戶的會計科目`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
