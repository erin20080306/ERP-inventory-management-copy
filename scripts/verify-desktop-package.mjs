import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const packageJson = JSON.parse(read("desktop/package.json"));
const securityBootstrap = read("desktop/security-bootstrap.cjs");
const afterPack = read("desktop/scripts/after-pack.cjs");
const runtimeRepair = read("desktop/runtime-repair.cjs");
const v107Bootstrap = read("desktop/v107-bootstrap.cjs");
const bootstrap = read("desktop/bootstrap.cjs");
const main = read("desktop/main.cjs");
const setupHtml = read("desktop/setup.html");
const setupJs = read("desktop/setup.js");
const hardwarePreload = read("desktop/hardware-preload.cjs");
const compose = read("docker-compose.local.yml");
const caddy = read("docker/Caddyfile");
const workflow = read(".github/workflows/release-desktop.yml");
const macInstaller = read("installer/安裝艾琳ERP.command");
const windowsInstaller = read("installer/安裝艾琳ERP.ps1");
const registerServer = read("src/app/api/license/register-server/route.ts");
const localStatus = read("src/app/api/license/local-status/route.ts");
const discoverRoute = read("src/app/api/license/discover/route.ts");
const localLoginProfile = read("src/app/api/local-login-profile/route.ts");
const leaseRoute = read("src/app/api/license/lease/route.ts");
const runtimeMode = read("src/app/api/runtime-mode/route.ts");
const loginPage = read("src/app/login/page.tsx");
const licenseLibrary = read("src/lib/license.ts");
const manifestScript = read("scripts/write-release-manifest.mjs");
const downloadPage = read("src/app/(app)/downloads/page.tsx");
const dockerfile = read("Dockerfile");
const backupEntrypoint = read("docker/backup-entrypoint.sh");

for (const file of [
  "desktop/security-bootstrap.cjs",
  "desktop/runtime-repair.cjs",
  "desktop/v107-bootstrap.cjs",
  "desktop/bootstrap.cjs",
  "desktop/main.cjs",
  "desktop/preload.cjs",
  "desktop/hardware-preload.cjs",
  "desktop/setup.js",
]) execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });

assert.equal(packageJson.main, "security-bootstrap.cjs");
assert.equal(packageJson.build.extraMetadata.main, "security-bootstrap.cjs");
for (const file of ["security-bootstrap.cjs", "runtime-repair.cjs", "v107-bootstrap.cjs", "bootstrap.cjs", "main.cjs"]) {
  assert.ok(packageJson.build.files.includes(file), `desktop build 缺少 ${file}`);
}
assert.equal(packageJson.build.appId, "design.erin.erp.desktop");
assert.equal(packageJson.build.productName, "艾琳 ERP");
assert.equal(packageJson.build.afterPack, "scripts/after-pack.cjs");
assert.equal(packageJson.build.nsis.oneClick, true);
assert.match(packageJson.build.mac.artifactName, /^ErinERP-Desktop-/);
assert.match(packageJson.build.win.artifactName, /^ErinERP-Desktop-/);
assert.match(packageJson.scripts["dist:mac:manual"], /CSC_IDENTITY_AUTO_DISCOVERY=false/);
assert.match(packageJson.scripts["dist:win:manual"], /signExecutable=false/);

assert.match(securityBootstrap, /app\.enableSandbox\(\)/);
assert.match(securityBootstrap, /ELECTRON_ENABLE_SECURITY_WARNINGS/);
assert.match(securityBootstrap, /will-attach-webview/);
assert.match(securityBootstrap, /setWindowOpenHandler/);
assert.match(securityBootstrap, /isSafeExternal/);
assert.match(securityBootstrap, /require\("\.\/v107-bootstrap\.cjs"\)/);
assert.match(afterPack, /xattr/);
assert.match(afterPack, /codesign/);

assert.match(runtimeRepair, /repairWorkstationIdentity/);
assert.match(runtimeRepair, /createPublicKey\(privateKey\)/);
assert.match(runtimeRepair, /scheduleUpdaterRepair/);
assert.match(runtimeRepair, /--build", "--force-recreate", "updater/);
assert.match(runtimeRepair, /syncWorkstationActivationFromLocalHost/);
assert.match(runtimeRepair, /timingSafeEqual/);
assert.match(v107Bootstrap, /repairWorkstationIdentity\(\)/);
assert.match(v107Bootstrap, /syncWorkstationActivationFromLocalHost\(\)/);
assert.match(v107Bootstrap, /scheduleUpdaterRepair\(\)/);
assert.match(v107Bootstrap, /ensureWindowsHostPathCompatibility\(\)/);
assert.match(v107Bootstrap, /require\("\.\/v106-bootstrap\.cjs"\)/);

assert.match(bootstrap, /accept-encoding", "identity"/);
assert.match(bootstrap, /removeAllListeners\("will-navigate"\)/);
assert.match(bootstrap, /serverOrigin && parsed\.origin === serverOrigin/);
assert.match(bootstrap, /require\("\.\/main\.cjs"\)/);
assert.match(main, /safeStorage\.encryptString/);
assert.match(main, /generateKeyPairSync\("ed25519"\)/);
assert.match(main, /x-erin-workstation-proof/);
assert.match(main, /deviceRole:\s*"WORKSTATION"/);
assert.match(main, /verifyCompanyDiscovery/);
assert.doesNotMatch(main, /nodeIntegration:\s*true/);
assert.doesNotMatch(main, /rejectUnauthorized:\s*false/);
assert.match(main, /requireApplicationSender/);
assert.match(hardwarePreload, /contextBridge\.exposeInMainWorld\("erinHardware"/);
assert.doesNotMatch(hardwarePreload, /ipcRenderer\.send\(/);

assert.doesNotMatch(setupHtml, /id="companyCode"/);
assert.doesNotMatch(setupHtml, /id="manualMode"/);
assert.match(setupHtml, /只要輸入[\s\S]*啟用碼/);
assert.doesNotMatch(setupJs, /companyCode\.value/);
assert.match(discoverRoute, /companyCode:[\s\S]*\.optional\(\)/);
assert.match(leaseRoute, /DEVICE_AUTO_REPLACED/);
assert.doesNotMatch(leaseRoute, /SEAT_LIMIT|SERVER_LIMIT/);

assert.match(compose, /caddy:2\.10-alpine/);
assert.match(compose, /\.\/Caddyfile:\/etc\/caddy\/Caddyfile:ro/);
assert.doesNotMatch(compose, /"\$\{ERP_PORT:-3000\}:3000"/);
assert.match(compose, /LOCAL_INSTALLER_TOKEN/);
assert.match(compose, /BACKUP_ENCRYPTION_KEY/);
assert.match(caddy, /tls internal/);
assert.match(caddy, /reverse_proxy app:3000/);
assert.match(dockerfile, /postgresql-client/);
assert.match(dockerfile, /FROM base AS production-deps/);
assert.match(backupEntrypoint, /create-encrypted-backup\.ts/);

for (const installer of [macInstaller, windowsInstaller]) {
  assert.match(installer, /LOCAL_INSTALLER_TOKEN|LocalInstallerToken/);
  assert.match(installer, /api\/license\/local-status/);
  assert.match(installer, /api\/license\/register-server/);
  assert.match(installer, /BACKUP_ENCRYPTION_KEY|BackupEncryptionKey/);
  assert.match(installer, /HOST_BACKUP_DIR|BackupDirDocker/);
  assert.match(installer, /管理員登入資料\.txt/);
  assert.match(installer, /使用原本網站註冊密碼/);
}
assert.match(registerServer, /hashActivationKey/);
assert.match(registerServer, /hashDeviceId/);
assert.match(localStatus, /timingSafeEqual/);
assert.match(localStatus, /refreshLocalLicenseLease/);
assert.match(licenseLibrary, /syncPrimaryAccount/);
assert.match(runtimeMode, /LOCAL_LICENSE_MODE/);
assert.match(localLoginProfile, /offlineLicenseLease\.findFirst/);
assert.doesNotMatch(localLoginProfile, /passwordHash:\s*true/);
assert.match(loginPage, /api\/local-login-profile/);
assert.match(main, /appWindow\.loadURL\(`\$\{origin\}\/login`\)/);
assert.match(manifestScript, /sha256/);
assert.match(manifestScript, /erin-erp-release-manifest-v1/);
assert.match(downloadPage, /步驟 1：只選一個公司主機/);
assert.match(downloadPage, /步驟 2：每台電腦選自己的工作站/);

for (const secretName of ["MAC_CSC_LINK", "APPLE_APP_SPECIFIC_PASSWORD", "WIN_CSC_LINK"]) {
  assert.match(workflow, new RegExp(secretName));
}
assert.match(workflow, /needs: \[host-installers, desktop-clients\]/);
assert.match(workflow, /host_only:/);

console.log("Desktop package, hardened bootstrap, signature repair, updater recovery and installer security configuration: PASS");
