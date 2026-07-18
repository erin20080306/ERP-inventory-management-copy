import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("desktop/package.json", "utf8"));
const afterPack = readFileSync("desktop/scripts/after-pack.cjs", "utf8");
const main = readFileSync("desktop/main.cjs", "utf8");
const hardwarePreload = readFileSync("desktop/hardware-preload.cjs", "utf8");
const compose = readFileSync("docker-compose.local.yml", "utf8");
const caddy = readFileSync("docker/Caddyfile", "utf8");
const workflow = readFileSync(".github/workflows/release-desktop.yml", "utf8");
const macInstaller = readFileSync("installer/安裝艾琳ERP.command", "utf8");
const windowsInstaller = readFileSync("installer/安裝艾琳ERP.ps1", "utf8");
const registerServer = readFileSync("src/app/api/license/register-server/route.ts", "utf8");
const localStatus = readFileSync("src/app/api/license/local-status/route.ts", "utf8");
const leaseRoute = readFileSync("src/app/api/license/lease/route.ts", "utf8");
const runtimeMode = readFileSync("src/app/api/runtime-mode/route.ts", "utf8");
const loginPage = readFileSync("src/app/login/page.tsx", "utf8");
const licenseLibrary = readFileSync("src/lib/license.ts", "utf8");
const manifestScript = readFileSync("scripts/write-release-manifest.mjs", "utf8");
const downloadPage = readFileSync("src/app/(app)/downloads/page.tsx", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const backupEntrypoint = readFileSync("docker/backup-entrypoint.sh", "utf8");

for (const file of ["desktop/main.cjs", "desktop/preload.cjs", "desktop/hardware-preload.cjs", "desktop/setup.js"]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

assert.equal(packageJson.main, "main.cjs");
assert.equal(packageJson.build.appId, "design.erin.erp.desktop");
assert.equal(packageJson.build.productName, "艾琳 ERP");
assert.equal(packageJson.build.afterPack, "scripts/after-pack.cjs");
assert.equal(packageJson.build.nsis.oneClick, true);
assert.match(packageJson.build.mac.artifactName, /^ErinERP-Desktop-/);
assert.match(packageJson.build.win.artifactName, /^ErinERP-Desktop-/);
assert.match(packageJson.scripts["dist:mac"], /dmg/);
assert.match(packageJson.scripts["dist:mac:manual"], /CSC_IDENTITY_AUTO_DISCOVERY=false/);
assert.match(packageJson.scripts["dist:mac:test"], /CSC_IDENTITY_AUTO_DISCOVERY=false/);
assert.match(packageJson.scripts["dist:win"], /nsis/);
assert.match(packageJson.scripts["dist:win:manual"], /signExecutable=false/);
assert.match(packageJson.scripts["dist:win:test"], /signExecutable=false/);
assert.match(afterPack, /xattr/);
assert.match(afterPack, /codesign/);
assert.match(afterPack, /CSC_IDENTITY_AUTO_DISCOVERY/);

assert.match(main, /safeStorage\.encryptString/);
assert.match(main, /generateKeyPairSync\("ed25519"\)/);
assert.match(main, /x-erin-workstation-proof/);
assert.match(main, /deviceRole:\s*"WORKSTATION"/);
assert.match(main, /api\/license\/discover/);
assert.match(main, /verifyCompanyDiscovery/);
assert.match(main, /ERIN_ERP_COMPANY_DISCOVERY_V1/);
assert.match(main, /caFingerprint/);
assert.match(main, /app\.isPackaged[\s\S]*PRODUCTION_CENTRAL_URL/);
assert.doesNotMatch(main, /nodeIntegration:\s*true/);
assert.doesNotMatch(main, /rejectUnauthorized:\s*false/);
assert.match(main, /hardware-preload\.cjs/);
assert.match(main, /getPrintersAsync/);
assert.match(main, /openCustomerDisplayWindow/);
assert.match(main, /requireApplicationSender/);
assert.match(hardwarePreload, /contextBridge\.exposeInMainWorld\("erinHardware"/);
assert.doesNotMatch(hardwarePreload, /ipcRenderer\.send\(/);

assert.match(compose, /caddy:2\.10-alpine/);
assert.match(compose, /\.\/Caddyfile:\/etc\/caddy\/Caddyfile:ro/);
assert.doesNotMatch(compose, /"\$\{ERP_PORT:-3000\}:3000"/);
assert.match(caddy, /tls internal/);
assert.match(caddy, /reverse_proxy app:3000/);
assert.match(compose, /LOCAL_INSTALLER_TOKEN/);
assert.match(compose, /backup:/);
assert.match(compose, /BACKUP_ENCRYPTION_KEY/);
assert.match(compose, /backup-entrypoint\.sh/);
assert.match(compose, /EINVOICE_PROVIDER/);
assert.match(compose, /EINVOICE_MIG_VERSION/);
assert.match(compose, /EINVOICE_TURNKEY_OUTBOX_DIR/);
assert.match(compose, /EINVOICE_VAN_BASE_URL/);
assert.match(dockerfile, /postgresql-client/);
assert.match(backupEntrypoint, /create-encrypted-backup\.ts/);

for (const installer of [macInstaller, windowsInstaller]) {
  assert.match(installer, /LOCAL_INSTALLER_TOKEN|LocalInstallerToken/);
  assert.match(installer, /api\/license\/local-status/);
  assert.match(installer, /api\/license\/register-server/);
  assert.match(installer, /BACKUP_ENCRYPTION_KEY|BackupEncryptionKey/);
  assert.match(installer, /HOST_BACKUP_DIR|BackupDirDocker/);
  assert.match(installer, /EINVOICE_MIG_VERSION/);
  assert.match(installer, /EINVOICE_PROVIDER|EInvoiceProvider/);
  assert.match(installer, /管理員登入資料\.txt/);
  assert.match(installer, /使用原本網站註冊密碼/);
  assert.match(installer, /STATUS_ERROR|StatusError/);
  assert.doesNotMatch(installer, /選擇系統/);
}
assert.match(registerServer, /hashActivationKey/);
assert.match(registerServer, /hashDeviceId/);
assert.match(registerServer, /deviceRole !== "SERVER"/);
assert.match(localStatus, /timingSafeEqual/);
assert.match(localStatus, /refreshLocalLicenseLease/);
assert.match(localStatus, /loginAccount/);
assert.match(leaseRoute, /deviceRole === "SERVER"[\s\S]*primaryAccount/);
assert.match(leaseRoute, /\.\.\.\(parsed\.data\.deviceRole === "SERVER" \? \{ primaryAccount \} : \{\}\)/);
assert.match(licenseLibrary, /syncPrimaryAccount/);
assert.match(licenseLibrary, /loginLog\.deleteMany/);
assert.match(runtimeMode, /LOCAL_LICENSE_MODE/);
assert.match(runtimeMode, /demoLoginEnabled: !localLicenseMode/);
assert.match(loginPage, /runtime\.localLicenseMode === true \? "local" : "online"/);
assert.match(loginPage, /showDemoPreview &&/);
assert.match(loginPage, /公司主機登入：請使用原本註冊的帳號或 Email 與原本密碼/);
assert.match(manifestScript, /sha256/);
assert.match(manifestScript, /erin-erp-release-manifest-v1/);
assert.match(manifestScript, /ad-hoc-manual/);

assert.match(downloadPage, /步驟 1：只選一個公司主機/);
assert.match(downloadPage, /步驟 2：每台電腦選自己的工作站/);
assert.match(downloadPage, /Intel Mac 尚未提供/);
assert.match(downloadPage, /Mac 備用格式，與 DMG 二選一/);
assert.match(downloadPage, /兩台工作站共占 2 個授權席次/);

for (const secretName of ["MAC_CSC_LINK", "APPLE_APP_SPECIFIC_PASSWORD", "WIN_CSC_LINK"]) {
  assert.match(workflow, new RegExp(secretName));
}
assert.match(workflow, /needs: \[host-installers, desktop-clients\]/);

console.log("Desktop package and security configuration: PASS");
