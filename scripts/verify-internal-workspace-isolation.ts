import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tenantMedicalSitePath, tenantStorefrontPath } from "../src/lib/storefront-access";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

async function main() {
const [
  schema,
  migration,
  posBootstrap,
  posShift,
  checkout,
  products,
  restaurant,
  medicalBootstrap,
  medicalWorkspace,
  storeApi,
  medicalSiteApi,
  settingsApi,
] = await Promise.all([
  read("prisma/schema.prisma"),
  read("prisma/migrations/20260724130000_pos_register_workspace_isolation/migration.sql"),
  read("src/lib/pos-bootstrap.ts"),
  read("src/app/api/pos/shifts/route.ts"),
  read("src/app/api/pos/checkout/route.ts"),
  read("src/app/api/pos/products/route.ts"),
  read("src/app/api/pos/restaurant/route.ts"),
  read("src/app/api/medical/bootstrap/route.ts"),
  read("src/app/(app)/medical/medical-workspace.tsx"),
  read("src/app/api/store/[tenant]/route.ts"),
  read("src/app/api/medical-site/[tenant]/route.ts"),
  read("src/app/api/settings/route.ts"),
]);

assert.match(schema, /enum PosRegisterMode\s*\{[\s\S]*POS_RETAIL[\s\S]*POS_RESTAURANT[\s\S]*POS_MEDICAL[\s\S]*\}/);
assert.match(schema, /mode\s+PosRegisterMode\s+@default\(POS_RETAIL\)/);
assert.match(schema, /@@index\(\[tenantId, mode, isActive\]\)/);

assert.match(migration, /SET "mode" = 'POS_MEDICAL'/);
assert.match(migration, /'REST-01'[\s\S]*'POS_RESTAURANT'/);
assert.match(migration, /WHERE tenant\."isInternal" = TRUE/);

assert.match(posBootstrap, /where: \{ tenantId, userId, status: "OPEN", register: registerScope \}/);
assert.match(posBootstrap, /where: \{ tenantId, mode, isActive: true \}/);
assert.match(posShift, /pos-user-workspace-shift:[^`]*\$\{register\.mode\}/);
assert.match(posShift, /register: \{ mode: register\.mode \}/);

assert.match(checkout, /const workspaceMode = shift\.register\.mode/);
assert.match(checkout, /productCatalogScope\(workspaceMode\)/);
assert.match(checkout, /workspaceMode === "POS_RETAIL"[\s\S]*posPromotion\.findMany/);
assert.match(products, /register\?\.mode \?\? normalizeBusinessMode/);
assert.match(restaurant, /register: \{ mode: "POS_RESTAURANT" \}/);

assert.match(medicalBootstrap, /loadPosBootstrap\(\{[\s\S]*mode: "POS_MEDICAL"/);
assert.doesNotMatch(medicalWorkspace, /jsonFetch\("\/api\/pos\/bootstrap"\)/);
assert.match(medicalWorkspace, /此處只計算醫美櫃台，不會混入零售或餐飲 POS/);

assert.match(storeApi, /isInternal: true/);
assert.match(storeApi, /productCatalogScope\("ECOMMERCE"\)/);
assert.match(medicalSiteApi, /isInternal: true/);
assert.match(settingsApi, /const ecommerce = tenant\?\.isInternal/);
assert.match(settingsApi, /const medical = tenant\?\.isInternal/);

const internalAdmin = {
  tenantId: "tenant-internal",
  companyCode: "ERIN-INTERNAL",
  isSuperAdmin: true,
  businessMode: "POS_RESTAURANT",
  permissions: ["*"],
};
assert.equal(tenantStorefrontPath(internalAdmin), "https://erp-inventory-management-copy.vercel.app/store/ERIN-INTERNAL");
assert.equal(tenantMedicalSitePath(internalAdmin), "https://erp-inventory-management-copy.vercel.app/medical/ERIN-INTERNAL");

console.log("internal five-workspace POS isolation, public URLs, and medical fast bootstrap: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
