import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const discoveryRoute = readFileSync("src/app/api/admin/licenses/discovery/route.ts", "utf8");
const registerRoute = readFileSync("src/app/api/license/register-server/route.ts", "utf8");
const macInstaller = readFileSync("installer/安裝艾琳ERP.command", "utf8");
const windowsInstaller = readFileSync("installer/安裝艾琳ERP.ps1", "utf8");

assert.match(discoveryRoute, /pendingHostRegistration/);
assert.match(discoveryRoute, /授權可先完成/);
assert.doesNotMatch(discoveryRoute, /啟用自動連線前，必須填寫公司主機網址與 CA 憑證/);
assert.match(registerRoute, /COMPANY_SERVER_AUTO_REGISTERED/);
assert.match(registerRoute, /discoveryCaCertificate/);
assert.match(macInstaller, /api\/license\/register-server/);
assert.match(macInstaller, /caCertificateB64/);
assert.match(windowsInstaller, /api\/license\/register-server/);
assert.match(windowsInstaller, /CaCertificateB64|caCertificateB64/);

console.log("Host auto discovery flow: PASS");
