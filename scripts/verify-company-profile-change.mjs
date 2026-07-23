import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settingsApi = readFileSync("src/app/api/settings/route.ts", "utf8");
const centralProfileApi = readFileSync("src/app/api/license/company-profile/route.ts", "utf8");
const modeApi = readFileSync("src/app/api/admin/tenants/mode/route.ts", "utf8");
const adminPage = readFileSync("src/app/admin/page.tsx", "utf8");
const settingsClient = readFileSync("src/app/(app)/settings/client.tsx", "utf8");
const runtimeRepair = readFileSync("desktop/runtime-repair.cjs", "utf8");

assert.match(settingsApi, /companyNameChanged/);
assert.match(settingsApi, /api\/license\/company-profile/);
assert.match(settingsApi, /licenseVersion: \{ increment: 1 \}/);
assert.match(settingsApi, /refreshLocalLicenseLease\(tenantId\)/);
assert.match(centralProfileApi, /deviceRole !== "SERVER"/);
assert.match(centralProfileApi, /hashActivationKey/);
assert.match(centralProfileApi, /hashDeviceId/);
assert.match(centralProfileApi, /COMPANY_NAME_CHANGED/);
assert.match(modeApi, /preserveData/);
assert.match(modeApi, /confirmationName/);
assert.match(modeApi, /protectedRecordCounts/);
assert.match(modeApi, /licenseVersion: \{ increment: 1 \}/);
assert.doesNotMatch(modeApi, /\.delete(?:Many)?\(/);
assert.match(adminPage, /只套用業態變更（不建立付款）/);
assert.match(adminPage, /不要求客戶重新安裝/);
assert.match(settingsClient, /租戶、資料、啟用碼及安裝程式都不會更換/);
assert.match(runtimeRepair, /syncWorkstationActivationFromLocalHost/);
assert.match(runtimeRepair, /LOCAL_ACTIVATION_KEY/);

console.log("Company rename sync / protected business-mode transition / same-machine Host pairing: PASS");
