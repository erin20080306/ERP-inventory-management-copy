import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leaseApi = readFileSync("src/app/api/license/lease/route.ts", "utf8");
const licenseSource = readFileSync("src/lib/license.ts", "utf8");
const authSource = readFileSync("src/lib/auth.ts", "utf8");
const baselineSource = readFileSync("src/lib/tenant-baseline.ts", "utf8");

assert.match(leaseApi, /companySettings: \{ select: \{ storeSlug: true, storeName: true \}/);
assert.match(leaseApi, /const companyCode = tenant\.companyCode \|\| await ensureTenantCompanyCode/);
assert.match(leaseApi, /companyCode,\s*storeSlug,\s*storeName,/s);
assert.match(leaseApi, /isTenantOwner: true/);

assert.match(licenseSource, /lease\.payload\.companyCode/);
assert.match(licenseSource, /lease\.payload\.storeSlug/);
assert.match(licenseSource, /data: \{ name: tenantName, businessMode, companyCode \}/);
assert.match(licenseSource, /data: \{ name: tenantName, storeName, storeSlug \}/);
assert.match(licenseSource, /data: \{ tenantId, name: tenantName, currency: "TWD", storeName, storeSlug \}/);

assert.match(authSource, /process\.env\.LOCAL_LICENSE_MODE === "true"/);
assert.match(authSource, /token\.companyCode = localTenant\.companyCode/);
assert.match(authSource, /localTenant\.companySettings\[0\]\?\.storeSlug \?\? localTenant\.companyCode\.toLowerCase\(\)/);

assert.match(baselineSource, /tenant_baseline_v5_seeded/);
assert.doesNotMatch(baselineSource, /tenant_baseline_v4_seeded/);

console.log("Installed tenant storefront identity sync and baseline repair: PASS");
