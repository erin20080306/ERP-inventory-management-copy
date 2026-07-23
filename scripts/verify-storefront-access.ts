import assert from "node:assert/strict";
import {
  canManageTenantStorefront,
  isTenantHighestPrivilege,
  tenantStorefrontPath,
} from "../src/lib/storefront-access";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ERP_DEMO_IMAGE_BY_SKU,
  resolveDemoProductImage,
  RESTAURANT_DEMO_IMAGE_BY_SKU,
  RETAIL_DEMO_IMAGE_BY_SKU,
} from "../src/lib/demo-product-media";
import { RESTAURANT_PRODUCTS, RETAIL_PRODUCTS } from "../src/lib/seed-operational-baseline";

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
for (const imageUrl of Object.values(RETAIL_DEMO_IMAGE_BY_SKU)) {
  assert.equal(existsSync(path.join(process.cwd(), "public", imageUrl)), true, `${imageUrl} must exist`);
}
for (const product of [...RETAIL_PRODUCTS, ...RESTAURANT_PRODUCTS]) {
  assert.ok(product.imageUrl, `${product.sku} must have an image in POS and product management`);
  assert.equal(resolveDemoProductImage(product.sku, null), product.imageUrl);
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
const settingsClient = readFileSync("src/app/(app)/settings/client.tsx", "utf8");
const productApi = readFileSync("src/app/api/products/route.ts", "utf8");
const loginPage = readFileSync("src/app/login/page.tsx", "utf8");
assert.doesNotMatch(commerceDashboard, /商城已綁定公司代碼/);
assert.doesNotMatch(commerceWorkspace, /商城與後台共用公司代碼/);
assert.match(commerceStoreApi, /businessMode: "ECOMMERCE"/);
assert.match(commerceStoreApi, /tenantId: tenant\.id/);
assert.match(commerceStoreApi, /companySettings: \{ some: \{ storeSlug/);
assert.match(commerceStoreApi, /storeName/);
assert.match(commerceStoreApi, /isActive: true, isPublished: true/);
assert.match(productApi, /isPublished: z\.boolean\(\)\.default\(true\)/);
assert.doesNotMatch(commerceStorefront, /SaaS 租戶/);
assert.match(settingsClient, /商城名稱與專屬網址/);
assert.match(settingsClient, /商城網址已複製/);
assert.match(settingsClient, /電商月租與年租方案另收一次設定費 NT\$1,500/);
assert.match(loginPage, /電商客戶｜您的專屬商城網址/);
assert.match(loginPage, /登入後查看專屬商城網址/);

console.log("Tenant storefront / ERP switching access: PASS");
