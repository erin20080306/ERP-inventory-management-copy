import assert from "node:assert/strict";
import {
  canManageTenantStorefront,
  isTenantHighestPrivilege,
  tenantStorefrontPath,
} from "../src/lib/storefront-access";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveDemoProductImage, RETAIL_DEMO_IMAGE_BY_SKU } from "../src/lib/demo-product-media";

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
for (const imageUrl of Object.values(RETAIL_DEMO_IMAGE_BY_SKU)) {
  assert.equal(existsSync(path.join(process.cwd(), "public", imageUrl)), true, `${imageUrl} must exist`);
}

console.log("Tenant storefront / ERP switching access: PASS");
