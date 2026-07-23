import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEMO_PRODUCT_IMAGE_BY_SKU } from "../src/lib/demo-product-media";
import { activateTenantLicense, revokeTenantLicense } from "../src/lib/license";
import { seedTenantDefaults } from "../src/lib/seed-tenant";

const prisma = new PrismaClient();
const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(databaseUrl) || !/erp_preview/.test(databaseUrl)) {
  throw new Error("此腳本只允許連線本機 erp_preview 測試資料庫");
}

const accounts = [
  { username: "demo-erp", password: "DemoERP2026!", email: "demo-erp@local.test", company: "示範企業有限公司", name: "企業版示範管理員", mode: "ERP", state: "PAID", planCode: "TEAM_3", billing: "ANNUAL", paidAmount: 9_990 },
  { username: "demo-retail", password: "DemoRetail2026!", email: "demo-retail@local.test", company: "艾琳選物示範門市", name: "零售版示範管理員", mode: "POS_RETAIL", state: "PAID", planCode: "TEAM_2", billing: "MONTHLY", paidAmount: 699 },
  { username: "demo-food", password: "DemoFood2026!", email: "demo-food@local.test", company: "艾琳小館示範店", name: "餐飲版示範管理員", mode: "POS_RESTAURANT", state: "PAID", planCode: "TEAM_5", billing: "ONCE", paidAmount: 45_000 },
  { username: "demo-trial", password: "DemoTrial2026!", email: "demo-trial@local.test", company: "三日試用示範公司", name: "試用中示範管理員", mode: "ERP", state: "TRIAL" },
  { username: "demo-expired", password: "DemoExpired2026!", email: "demo-expired@local.test", company: "試用到期示範門市", name: "試用到期示範管理員", mode: "POS_RETAIL", state: "EXPIRED" },
  { username: "demo-revoked", password: "DemoRevoked2026!", email: "demo-revoked@local.test", company: "授權撤銷示範公司", name: "授權撤銷示範管理員", mode: "ERP", state: "REVOKED", planCode: "TEAM_2", billing: "MONTHLY", paidAmount: 699 },
] as const;

async function ensureProduct(input: { tenantId: string; categoryId: string; unitId: string; warehouseId: string; sku: string; barcode?: string; name: string; cost: number; price: number; imageUrl?: string }) {
  const product = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId: input.tenantId, sku: input.sku } },
    update: { name: input.name, barcode: input.barcode, categoryId: input.categoryId, unitId: input.unitId, costPrice: input.cost, salePrice: input.price, imageUrl: input.imageUrl, isActive: true },
    create: { tenantId: input.tenantId, sku: input.sku, barcode: input.barcode, name: input.name, categoryId: input.categoryId, unitId: input.unitId, costPrice: input.cost, salePrice: input.price, imageUrl: input.imageUrl },
  });
  await prisma.inventoryStock.upsert({
    where: { productId_warehouseId: { productId: product.id, warehouseId: input.warehouseId } },
    update: { quantity: 100 },
    create: { tenantId: input.tenantId, productId: product.id, warehouseId: input.warehouseId, quantity: 100 },
  });
}

async function main() {
  const adminRole = await prisma.role.findUnique({ where: { name: "系統管理員" } });
  if (!adminRole) throw new Error("缺少系統管理員角色，請先套用 migrations");

  for (const account of accounts) {
    const existingUser = await prisma.user.findUnique({ where: { username: account.username } });
    const createdAt = account.state === "EXPIRED" ? new Date(Date.now() - 4 * 24 * 60 * 60_000) : new Date();
    const tenant = existingUser?.tenantId
      ? await prisma.tenant.update({ where: { id: existingUser.tenantId }, data: { name: account.company, businessMode: account.mode, licensePlan: null, licenseBilling: null, licenseStatus: "TRIAL", licenseSeatLimit: 2, licenseActivatedAt: null, licenseExpiresAt: null, licenseMaintenanceEnd: null, licenseKeyHash: null, licenseKeyPrefix: null, licenseVersion: 0, licenseUpdatedAt: null, createdAt } })
      : await prisma.tenant.create({ data: { name: account.company, businessMode: account.mode, licenseStatus: "TRIAL", createdAt } });
    await prisma.$transaction([
      prisma.offlineLicenseLease.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.licenseDevice.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.licensePayment.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.licenseEvent.deleteMany({ where: { tenantId: tenant.id } }),
    ]);
    const passwordHash = await bcrypt.hash(account.password, 12);
    const user = await prisma.user.upsert({
      where: { username: account.username },
      update: { tenantId: tenant.id, email: account.email, name: account.name, passwordHash, isActive: true, trialStart: createdAt, isPaid: false, paymentType: null, subscriptionEnd: null },
      create: { tenantId: tenant.id, username: account.username, email: account.email, name: account.name, passwordHash, isActive: true, trialStart: createdAt },
    });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: adminRole.id } }, update: {}, create: { userId: user.id, roleId: adminRole.id } });
    await seedTenantDefaults(tenant.id);

    if (account.state === "PAID" || account.state === "REVOKED") {
      await activateTenantLicense({
        tenantId: tenant.id,
        planCode: account.planCode,
        billing: account.billing,
        actorUserId: "local-demo-seed",
        payment: {
          paidAmount: account.paidAmount,
          paidAt: new Date(),
          paymentMethod: "BANK_TRANSFER",
          paymentReference: `LOCAL-${account.username.toUpperCase()}-PAID`,
          notes: "本機生命週期驗收資料，非真實付款",
        },
      });
      if (account.state === "REVOKED") await revokeTenantLicense(tenant.id, "local-demo-seed");
    }

    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id, code: "WH01" } });
    const unit = await prisma.productUnit.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "PCS" } }, update: {}, create: { tenantId: tenant.id, code: "PCS", name: account.mode === "POS_RESTAURANT" ? "份" : "個" } });
    if (account.mode === "POS_RESTAURANT") {
      const meal = await prisma.productCategory.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "MEAL" } }, update: {}, create: { tenantId: tenant.id, code: "MEAL", name: "主餐" } });
      const drink = await prisma.productCategory.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "DRINK" } }, update: {}, create: { tenantId: tenant.id, code: "DRINK", name: "飲品甜點" } });
      const snack = await prisma.productCategory.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "SNACK" } }, update: {}, create: { tenantId: tenant.id, code: "SNACK", name: "小點" } });
      const items = [
        { sku: "F001", name: "經典牛肉漢堡", cost: 80, price: 220, categoryId: meal.id },
        { sku: "F002", name: "香蒜奶油義大利麵", cost: 65, price: 190, categoryId: meal.id },
        { sku: "F003", name: "松露脆薯", cost: 35, price: 120, categoryId: snack.id },
        { sku: "F004", name: "香煎雞腿排", cost: 105, price: 260, categoryId: meal.id },
        { sku: "F005", name: "奶油鮭魚燉飯", cost: 120, price: 280, categoryId: meal.id },
        { sku: "F006", name: "和風鮮蔬沙拉", cost: 55, price: 150, categoryId: snack.id },
        { sku: "F007", name: "主廚玉米濃湯", cost: 30, price: 90, categoryId: snack.id },
        { sku: "D001", name: "拿鐵咖啡", cost: 30, price: 110, categoryId: drink.id },
        { sku: "D002", name: "季節水果茶", cost: 28, price: 100, categoryId: drink.id },
        { sku: "D003", name: "焦糖乳酪蛋糕", cost: 45, price: 130, categoryId: drink.id },
        { sku: "D004", name: "經典提拉米蘇", cost: 60, price: 160, categoryId: drink.id },
        { sku: "D005", name: "柚香氣泡飲", cost: 35, price: 120, categoryId: drink.id },
      ];
      for (const item of items) await ensureProduct({ tenantId: tenant.id, warehouseId: warehouse.id, unitId: unit.id, imageUrl: DEMO_PRODUCT_IMAGE_BY_SKU[item.sku], ...item });
    } else if (account.mode === "POS_RETAIL") {
      const categories = Object.fromEntries(await Promise.all([
        ["RETAIL-HOT", "熱銷推薦"],
        ["RETAIL-LIFE", "生活選物"],
        ["RETAIL-AROMA", "香氛保養"],
        ["RETAIL-ACC", "服飾配件"],
      ].map(async ([code, name]) => [code, await prisma.productCategory.upsert({ where: { tenantId_code: { tenantId: tenant.id, code } }, update: { name }, create: { tenantId: tenant.id, code, name } })])));
      const items = [
        { sku: "RTL-P001", barcode: "4712000000014", name: "純棉購物袋", cost: 80, price: 180, categoryId: categories["RETAIL-HOT"].id },
        { sku: "RTL-P002", barcode: "4712000000021", name: "不鏽鋼保溫杯", cost: 220, price: 490, categoryId: categories["RETAIL-HOT"].id },
        { sku: "RTL-P003", barcode: "4712000000038", name: "木質調香氛蠟燭", cost: 160, price: 360, categoryId: categories["RETAIL-AROMA"].id },
        { sku: "RTL-P004", barcode: "4712000000045", name: "極簡皮革卡夾", cost: 320, price: 680, categoryId: categories["RETAIL-ACC"].id },
        { sku: "RTL-P005", barcode: "4712000000052", name: "植萃護手霜", cost: 140, price: 320, categoryId: categories["RETAIL-AROMA"].id },
        { sku: "RTL-P006", barcode: "4712000000069", name: "亞麻室內拖鞋", cost: 260, price: 560, categoryId: categories["RETAIL-LIFE"].id },
        { sku: "RTL-P007", barcode: "4712000000076", name: "霧面陶瓷馬克杯", cost: 190, price: 420, categoryId: categories["RETAIL-LIFE"].id },
        { sku: "RTL-P008", barcode: "4712000000083", name: "棉麻日常圍裙", cost: 360, price: 780, categoryId: categories["RETAIL-ACC"].id },
        { sku: "RTL-P009", barcode: "4712000000090", name: "旅行收納袋組", cost: 260, price: 590, categoryId: categories["RETAIL-LIFE"].id },
        { sku: "RTL-P010", barcode: "4712000000106", name: "北歐針織抱枕", cost: 390, price: 890, categoryId: categories["RETAIL-LIFE"].id },
        { sku: "RTL-P011", barcode: "4712000000113", name: "天然精油滾珠瓶", cost: 210, price: 460, categoryId: categories["RETAIL-AROMA"].id },
        { sku: "RTL-P012", barcode: "4712000000120", name: "不鏽鋼餐具組", cost: 240, price: 520, categoryId: categories["RETAIL-HOT"].id },
      ];
      for (const item of items) await ensureProduct({ tenantId: tenant.id, unitId: unit.id, warehouseId: warehouse.id, imageUrl: DEMO_PRODUCT_IMAGE_BY_SKU[item.sku], ...item });
    } else {
      const category = await prisma.productCategory.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "DEMO" } }, update: {}, create: { tenantId: tenant.id, code: "DEMO", name: "一般商品" } });
      for (const item of [
        { sku: "P001", barcode: "4710000000011", name: "示範商品 A", cost: 60, price: 100 },
        { sku: "P002", barcode: "4710000000028", name: "示範商品 B", cost: 120, price: 199 },
        { sku: "P003", barcode: "4710000000035", name: "示範商品 C", cost: 240, price: 390 },
      ]) await ensureProduct({ tenantId: tenant.id, categoryId: category.id, unitId: unit.id, warehouseId: warehouse.id, ...item });
    }
  }

  console.log("Local demo lifecycle accounts ready:");
  for (const account of accounts) console.log(`${account.username} / ${account.password} / ${account.mode} / ${account.state}`);
}

main().finally(() => prisma.$disconnect());
