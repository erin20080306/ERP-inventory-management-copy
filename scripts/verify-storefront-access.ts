import assert from "node:assert/strict";
import {
  canManageTenantStorefront,
  canManageTenantMedicalSite,
  isTenantHighestPrivilege,
  tenantMedicalSitePath,
  tenantStorefrontPath,
} from "../src/lib/storefront-access";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  COMMERCE_DEMO_IMAGE_BY_SKU,
  ERP_DEMO_IMAGE_BY_SKU,
  resolveDemoProductImage,
  RESTAURANT_DEMO_IMAGE_BY_SKU,
  RETAIL_DEMO_IMAGE_BY_SKU,
} from "../src/lib/demo-product-media";
import {
  COMMERCE_PRODUCTS,
  RESTAURANT_PRODUCTS,
  RETAIL_PRODUCTS,
} from "../src/lib/seed-operational-baseline";
import { productCatalogScope } from "../src/lib/product-editions";

const tenantAdmin = {
  tenantId: "tenant-123",
  companyCode: "SHOP-TW-001",
  permissions: ["*"],
  businessMode: "ECOMMERCE" as const,
  isSuperAdmin: false,
};

assert.equal(isTenantHighestPrivilege(tenantAdmin), true);
assert.equal(tenantStorefrontPath(tenantAdmin), "/store/SHOP-TW-001");
assert.equal(canManageTenantStorefront(tenantAdmin, "SHOP-TW-001"), true);
assert.equal(canManageTenantStorefront(tenantAdmin, "shop-tw-001"), true);
assert.equal(canManageTenantStorefront(tenantAdmin, "tenant-123"), true);
assert.equal(canManageTenantStorefront(tenantAdmin, "another-tenant"), false);

const medicalAdmin = {
  ...tenantAdmin,
  companyCode: "MEDICAL-TW-001",
  businessMode: "POS_MEDICAL" as const,
};
assert.equal(tenantMedicalSitePath(medicalAdmin), "/medical/MEDICAL-TW-001");
assert.equal(canManageTenantMedicalSite(medicalAdmin, "MEDICAL-TW-001"), true);
assert.equal(canManageTenantMedicalSite(medicalAdmin, "medical-tw-001"), true);
assert.equal(canManageTenantMedicalSite(medicalAdmin, "another-tenant"), false);

assert.equal(canManageTenantStorefront({
  ...tenantAdmin,
  permissions: ["dashboard.view", "products.view"],
}, "SHOP-TW-001"), true, "authorized tenant users should receive their own storefront management switch");

assert.equal(canManageTenantStorefront({
  ...tenantAdmin,
  permissions: ["customers.view"],
}, "SHOP-TW-001"), false, "tenant users without ERP/storefront permissions must not receive the management switch");

assert.equal(canManageTenantStorefront({
  ...tenantAdmin,
  businessMode: "ERP",
}, "SHOP-TW-001"), false, "non-commerce tenants must not receive storefront management access");

assert.equal(canManageTenantStorefront({
  ...tenantAdmin,
  isSuperAdmin: true,
}, "SHOP-TW-001"), false, "platform admins must not impersonate another tenant storefront");

assert.equal(tenantStorefrontPath({
  tenantId: "Tenant A/01",
  permissions: ["*"],
  businessMode: "ECOMMERCE",
}), "/store/Tenant%20A%2F01");

assert.match(resolveDemoProductImage("F001", null) ?? "", /photo-1568901346375-23c9450c58cd/);
assert.equal(resolveDemoProductImage("RTL-P001", null), "/demo-products/cotton-tote.webp");
assert.equal(resolveDemoProductImage("F001", "/demo-products/burger.svg"), resolveDemoProductImage("F001", null));
assert.equal(resolveDemoProductImage("F001", "/uploads/custom-burger.webp"), "/uploads/custom-burger.webp");
assert.equal(resolveDemoProductImage("CUSTOM-001", null), null);
assert.equal(resolveDemoProductImage("LEGACY-APRON", null, "棉麻日常圍裙", "服飾配件"), "/demo-products/linen-apron.webp");
assert.match(resolveDemoProductImage("CUSTOM-AROMA-01", null, "門市香氛新品", "香氛保養") ?? "", /^\/demo-products\/.+\.webp$/);
assert.equal(resolveDemoProductImage("CUSTOM-OTHER-01", null, "一般門市新品", "其他"), null);
assert.match(resolveDemoProductImage("CUSTOM-OTHER-01", null, "一般門市新品", "其他", true) ?? "", /^\/demo-products\/.+\.webp$/);
assert.equal(Object.keys(RETAIL_DEMO_IMAGE_BY_SKU).length, 12);
assert.equal(RETAIL_PRODUCTS.length, 12, "一般 POS 必須固定提供 12 項基礎商品");
assert.equal(RESTAURANT_PRODUCTS.length, 12, "餐飲 POS 必須固定提供 12 項基礎商品");
assert.equal(COMMERCE_PRODUCTS.length, 12, "服飾電商必須固定提供 12 項服飾或配件商品");
assert.deepEqual(
  RETAIL_PRODUCTS.map((product) => product.sku).sort(),
  Object.keys(RETAIL_DEMO_IMAGE_BY_SKU).sort(),
  "一般 POS 的 12 項商品都必須有對應圖片",
);
assert.deepEqual(
  RESTAURANT_PRODUCTS.map((product) => product.sku).sort(),
  Object.keys(RESTAURANT_DEMO_IMAGE_BY_SKU).sort(),
  "餐飲 POS 的 12 項商品都必須有對應圖片",
);
assert.deepEqual(
  COMMERCE_PRODUCTS.map((product) => product.sku).sort(),
  Object.keys(COMMERCE_DEMO_IMAGE_BY_SKU).sort(),
  "服飾電商的 12 項商品都必須有對應圖片",
);
for (const products of [RETAIL_PRODUCTS, RESTAURANT_PRODUCTS, COMMERCE_PRODUCTS]) {
  assert.equal(new Set(products.map((product) => product.name)).size, 12, "同一模式的 12 項商品名稱不得重複");
  assert.equal(new Set(products.map((product) => product.imageUrl)).size, 12, "同一模式的 12 項商品圖片不得重複");
}
assert.ok(RETAIL_PRODUCTS.some((product) => product.sku === "RTL-P002" && product.name === "不鏽鋼保溫杯"));
assert.ok(RETAIL_PRODUCTS.some((product) => product.name === "木質調香氛蠟燭"));
assert.equal(
  COMMERCE_PRODUCTS.some((product) => /蠟燭|精油|保溫杯/.test(product.name)),
  false,
  "電商目錄只能保留服飾與配件",
);
for (const imageUrl of Object.values(RETAIL_DEMO_IMAGE_BY_SKU)) {
  assert.equal(existsSync(path.join(process.cwd(), "public", imageUrl)), true, `${imageUrl} must exist`);
}
for (const product of [...RETAIL_PRODUCTS, ...RESTAURANT_PRODUCTS, ...COMMERCE_PRODUCTS]) {
  assert.ok(product.imageUrl, `${product.sku} must have an image in POS, ecommerce, and product management`);
  assert.equal(resolveDemoProductImage(product.sku, null), product.imageUrl);
}
assert.deepEqual(productCatalogScope("POS"), {
  isArchived: false,
  catalogMode: "POS_RETAIL",
});
assert.deepEqual(productCatalogScope("POS_RESTAURANT"), {
  isArchived: false,
  catalogMode: "POS_RESTAURANT",
});
assert.deepEqual(productCatalogScope("ECOMMERCE"), {
  isArchived: false,
  catalogMode: "ECOMMERCE",
});
assert.deepEqual(productCatalogScope("POS_MEDICAL"), {
  isArchived: false,
  catalogMode: "POS_MEDICAL",
});
for (const image of [
  "clinic-hero.png",
  "skin-consultation.png",
  "hydration-care.png",
  "light-care.png",
  "treatment-planning.png",
  "clinic-consumables.png",
]) {
  assert.equal(existsSync(path.join(process.cwd(), "public", "medical-aesthetics", image)), true, `${image} must exist`);
}
assert.equal(Object.keys(ERP_DEMO_IMAGE_BY_SKU).length, 3);
for (const [sku, imageUrl] of Object.entries(ERP_DEMO_IMAGE_BY_SKU)) {
  assert.equal(resolveDemoProductImage(sku, null), imageUrl);
  assert.equal(existsSync(path.join(process.cwd(), "public", imageUrl)), true, `${imageUrl} must exist`);
}

const commerceDashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
const commerceWorkspace = readFileSync("src/app/(app)/workspace/page.tsx", "utf8");
const commerceStoreApi = readFileSync("src/app/api/store/[tenant]/route.ts", "utf8");
const commerceStorefront = readFileSync("src/app/store/[tenant]/[[...view]]/storefront.tsx", "utf8");
const commerceStorefrontStyles = readFileSync("src/app/store/[tenant]/[[...view]]/storefront.module.css", "utf8");
const memberRegisterApi = readFileSync("src/app/api/store/[tenant]/member/register/route.ts", "utf8");
const memberLoginApi = readFileSync("src/app/api/store/[tenant]/member/login/route.ts", "utf8");
const memberApi = readFileSync("src/app/api/store/[tenant]/member/route.ts", "utf8");
const memberPasswordApi = readFileSync("src/app/api/store/[tenant]/member/password/route.ts", "utf8");
const memberSession = readFileSync("src/lib/storefront-members.ts", "utf8");
const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
const commerceWorkspaceSource = readFileSync("src/app/(app)/workspace/page.tsx", "utf8");
const settingsClient = readFileSync("src/app/(app)/settings/client.tsx", "utf8");
const productApi = readFileSync("src/app/api/products/route.ts", "utf8");
const productSeed = readFileSync("src/lib/seed-operational-baseline.ts", "utf8");
const posProductApi = readFileSync("src/app/api/pos/products/route.ts", "utf8");
const restaurantApi = readFileSync("src/app/api/pos/restaurant/route.ts", "utf8");
const productCatalogMigration = readFileSync("prisma/migrations/20260724030000_product_catalog_modes/migration.sql", "utf8");
const productCatalogRepairMigration = readFileSync("prisma/migrations/20260724040000_repair_mode_product_catalogs/migration.sql", "utf8");
const tenantBaseline = readFileSync("src/lib/tenant-baseline.ts", "utf8");
const loginPage = readFileSync("src/app/login/page.tsx", "utf8");
assert.doesNotMatch(commerceDashboard, /商城已綁定公司代碼/);
assert.doesNotMatch(commerceWorkspace, /商城與後台共用公司代碼/);
assert.match(commerceStoreApi, /businessMode: "ECOMMERCE"/);
assert.match(commerceStoreApi, /tenantId: tenant\.id/);
assert.match(commerceStoreApi, /companySettings: \{ some: \{ storeSlug/);
assert.match(commerceStoreApi, /storeName/);
assert.match(commerceStoreApi, /isActive:\s*true,\s*isPublished:\s*true/);
assert.match(commerceStoreApi, /productCatalogScope\("ECOMMERCE"\)/);
assert.match(commerceStoreApi, /status: "SUBMITTED"/);
assert.match(commerceStoreApi, /inventory: "RESERVED"/);
assert.match(commerceStoreApi, /accounting: "PENDING_FULFILLMENT"/);
assert.match(commerceStoreApi, /status: paymentStatus/);
assert.match(commerceStorefront, /新會員註冊/);
assert.match(commerceStorefront, /會員登入/);
assert.match(commerceStorefront, /安全登出/);
assert.match(commerceStorefront, /編輯會員資料/);
assert.match(commerceStorefront, /永久刪除會員帳號/);
assert.match(commerceStorefront, /本次沒有扣款/);
assert.match(commerceStorefront, /王小美/);
assert.doesNotMatch(commerceStorefront, /王小美，午安/);
assert.doesNotMatch(commerceStorefront, /租戶資料隔離/);
assert.doesNotMatch(commerceStorefront, /安全密碼保存/);
assert.doesNotMatch(commerceStorefront, /訂單自動歸戶/);
assert.match(commerceStorefront, /亮黃連帽休閒套裝/);
assert.match(commerceStorefrontStyles, /\.shell \.memberAuthSubmit[^}]*color: #fff/);
assert.match(commerceStorefront, /\{managerAccess && \(\s*<section className=\{styles\.integration\}>/);
assert.match(commerceStorefront, /一般消費者不會看到/);
assert.match(memberRegisterApi, /bcrypt\.hash\(input\.password, 12\)/);
assert.match(memberRegisterApi, /tenantId_email/);
assert.match(memberLoginApi, /bcrypt\.compare/);
assert.match(memberApi, /export const PATCH/);
assert.match(memberApi, /export const DELETE/);
assert.match(memberPasswordApi, /bcrypt\.hash\(input\.newPassword, 12\)/);
assert.match(memberSession, /httpOnly: true/);
assert.match(memberSession, /sameSite: "lax"/);
assert.match(memberSession, /session\.tenantId !== tenantId/);
assert.match(prismaSchema, /model StorefrontMember/);
assert.match(prismaSchema, /passwordHash\s+String/);
assert.match(prismaSchema, /tokenHash\s+String\s+@unique/);
assert.match(prismaSchema, /model StorefrontPayment/);
assert.match(prismaSchema, /AWAITING_TRANSFER/);
assert.match(prismaSchema, /GATEWAY_REQUIRED/);
assert.match(productApi, /isPublished: z\.boolean\(\)\.default\(true\)/);
assert.match(productApi, /productCatalogScope\(businessMode\)/);
assert.match(productApi, /catalogMode, isArchived: false, updatedBy/);
assert.match(posProductApi, /productCatalogScope\(businessMode\)/);
assert.match(restaurantApi, /productCatalogScope\("POS_RESTAURANT"\)/);
assert.match(productSeed, /catalogMode: "POS_RETAIL"/);
assert.match(productSeed, /catalogMode: "POS_RESTAURANT"/);
assert.match(productSeed, /catalogMode: "ECOMMERCE"/);
assert.match(prismaSchema, /catalogMode\s+String\?/);
assert.match(prismaSchema, /isArchived\s+Boolean\s+@default\(false\)/);
assert.match(productCatalogMigration, /RETAIL-HOT/);
assert.match(productCatalogMigration, /POS_RESTAURANT/);
assert.match(productCatalogMigration, /ECOMMERCE/);
assert.match(productCatalogRepairMigration, /RTL-P002/);
assert.match(productCatalogRepairMigration, /木質調香氛蠟燭/);
assert.match(productCatalogRepairMigration, /POS_RETAIL/);
assert.match(tenantBaseline, /tenant_baseline_v4_seeded/);
assert.doesNotMatch(commerceStorefront, /SaaS 租戶/);
assert.match(settingsClient, /商城名稱與專屬網址/);
assert.match(settingsClient, /自訂網址名稱（選填）/);
assert.match(settingsClient, /留空不影響商城使用/);
assert.match(settingsClient, /不是公司代碼或自訂網域/);
assert.match(settingsClient, /商城網址已複製/);
assert.match(settingsClient, /電商月租與年租方案另收一次設定費 NT\$1,500/);
assert.match(settingsClient, /商城銀行轉帳資訊/);
assert.match(settingsClient, /正式收款需由客戶提供金流商帳號及串接資料後開通/);
assert.match(commerceWorkspaceSource, /王小美是預設體驗顧客/);
assert.match(loginPage, /電商客戶｜您的專屬商城網址/);
assert.match(loginPage, /登入後查看專屬商城網址/);

console.log("Tenant storefront / ERP switching access: PASS");
