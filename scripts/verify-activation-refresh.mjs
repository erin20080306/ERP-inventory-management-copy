import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const desktopPackage = JSON.parse(readFileSync("desktop/package.json", "utf8"));
const bootstrap = readFileSync("desktop/v107-bootstrap.cjs", "utf8");
const refresh = readFileSync("desktop/activation-refresh.cjs", "utf8");

execFileSync(process.execPath, ["--check", "desktop/v107-bootstrap.cjs"], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", "desktop/activation-refresh.cjs"], { stdio: "pipe" });

assert.ok(desktopPackage.build.files.includes("activation-refresh.cjs"));
assert.match(bootstrap, /require\("\.\/activation-refresh\.cjs"\)/);
assert.match(bootstrap, /await refreshActivationDiscovery\(\)/);
assert.ok(
  bootstrap.indexOf("await refreshActivationDiscovery()") < bootstrap.indexOf('require("./v106-bootstrap.cjs")'),
  "必須先更新公司主機 IP，再進入原本桌面啟動流程",
);
assert.match(refresh, /safeStorage\.decryptString/);
assert.match(refresh, /api\/license\/discover/);
assert.match(refresh, /JSON\.stringify\(\{ activationKey \}\)/);
assert.match(refresh, /verify:\s*cryptoVerify/);
assert.match(refresh, /ERIN_ERP_COMPANY_DISCOVERY_V1/);
assert.match(refresh, /caFingerprint|payload\.caFingerprint/);
assert.match(refresh, /activation-refresh\.tmp/);
assert.doesNotMatch(refresh, /companyCode:\s*config\.companyCode/);

console.log("Activation-only discovery refresh is packaged and runs before desktop startup: PASS");
