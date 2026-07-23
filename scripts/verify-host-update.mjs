import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const retryWait = new Int32Array(new SharedArrayBuffer(4));

function readText(path) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const content = readFileSync(path, "utf8");
    if (content.length > 0) return content;
    Atomics.wait(retryWait, 0, 0, 50);
  }
  const committedContent = execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" });
  if (committedContent.length > 0) return committedContent;
  throw new Error(`檔案暫時無法讀取或內容為空：${path}`);
}

const compose = readText("docker-compose.local.yml");
const updater = readText("updater/update.cgi");
const updaterDockerfile = readText("updater/Dockerfile");
const updateRoute = readText("src/app/api/system/update/route.ts");
const releaseRoute = readText("src/app/api/releases/current/route.ts");
const publicKeyRoute = readText("src/app/api/license/public-key/route.ts");
const bootstrapRoute = readText("src/app/api/installers/bootstrap/route.ts");
const updateLibrary = readText("src/lib/host-update.ts");
const signatureLibrary = readText("src/lib/ed25519-signature.ts");
const settings = readText("src/app/(app)/settings/client.tsx");
const notice = readText("src/components/update-notice.tsx");
const macInstaller = readText("installer/安裝艾琳ERP.command");
const windowsInstaller = readText("installer/安裝艾琳ERP.ps1");
const desktopMain = readText("desktop/main.cjs");
const desktopRepair = readText("desktop/runtime-repair.cjs");
const workflow = readText(".github/workflows/publish-host-container-image.yml");
const releaseMarker = readText("src/generated/current-host-release.ts");
const dockerfile = readText("Dockerfile");

const gitBin = join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin");
const shExecutable = process.platform === "win32" && existsSync(join(gitBin, "sh.exe")) ? join(gitBin, "sh.exe") : "sh";
const bashExecutable = process.platform === "win32" && existsSync(join(gitBin, "bash.exe")) ? join(gitBin, "bash.exe") : "bash";

execFileSync(shExecutable, ["-n", "updater/update.cgi"], { stdio: "pipe" });
execFileSync(bashExecutable, ["-n", "installer/安裝艾琳ERP.command"], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", "desktop/runtime-repair.cjs"], { stdio: "pipe" });

assert.match(compose, /updater:/);
assert.match(compose, /image: erin-erp-host-updater:2/);
assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
assert.match(compose, /no-new-privileges:true/);
assert.match(compose, /erp_update_state/);
assert.match(compose, /HOST_UPDATE_TOKEN/);
const updaterService = compose.split(/\r?\n  updater:\r?\n/)[1]?.split(/\r?\n  backup:\r?\n/)[0] || "";
assert.ok(updaterService.length > 0);
assert.doesNotMatch(updaterService, /\n\s+ports:/);
assert.match(updaterDockerfile, /docker-cli-compose/);
assert.match(updaterDockerfile, /ENTRYPOINT \["httpd"/);
assert.doesNotMatch(updaterDockerfile, /erin-httpd/);
assert.match(updater, /compose pull app backup/);
assert.match(updater, /create|pulling/);
assert.match(updater, /rolling_back/);
assert.match(updater, /docker image tag/);
assert.match(updater, /wait_for_app/);
assert.match(updateRoute, /createEncryptedDatabaseBackup/);
assert.match(updateRoute, /requirePermission\("settings\.manage"\)/);
assert.match(updateRoute, /latest\.version === currentVersion/);
assert.match(updateRoute, /state: "current"/);
const backupCallIndex = updateRoute.indexOf("backup = await createEncryptedDatabaseBackup()");
const currentVersionGuardIndex = updateRoute.indexOf("latest.version === currentVersion");
const updaterCallIndex = updateRoute.indexOf("void triggerHostUpdater()");
assert.ok(backupCallIndex >= 0, "找不到更新前備份呼叫");
assert.ok(currentVersionGuardIndex >= 0, "找不到已是最新版的防護判斷");
assert.ok(updaterCallIndex >= 0, "找不到背景更新服務呼叫");
assert.ok(backupCallIndex < updaterCallIndex, "必須先備份再呼叫背景更新服務");
assert.ok(currentVersionGuardIndex < updaterCallIndex, "必須先判斷是否已是最新版再呼叫背景更新服務");
assert.match(releaseRoute, /signOfflineLease/);
assert.match(releaseRoute, /ERIN_ERP_HOST_RELEASE_V1/);
assert.match(releaseRoute, /CURRENT_HOST_RELEASE/);
assert.doesNotMatch(releaseRoute, /VERCEL_GIT_COMMIT_SHA/);
assert.match(releaseMarker, /version:/);
assert.match(publicKeyRoute, /currentLicensePublicKeyB64/);
assert.match(publicKeyRoute, /Cache-Control": "no-store, max-age=0"/);
assert.match(signatureLibrary, /createPublicKey\(privateKey\)/);
assert.match(signatureLibrary, /verifySignedEnvelopeWithPublicKey/);
assert.match(updateLibrary, /verifyOfflineLease/);
assert.match(updateLibrary, /verifySignedEnvelopeWithPublicKey/);
assert.match(updateLibrary, /api\/license\/public-key/);
assert.match(updateLibrary, /headers: \{ "Cache-Control": "no-cache" \}/);
assert.match(updateLibrary, /image !== IMAGE/);
assert.match(updateLibrary, /背景更新服務無法連線/);
assert.match(desktopRepair, /scheduleUpdaterRepair/);
assert.match(desktopRepair, /--build", "--force-recreate", "updater/);
assert.match(settings, /備份並更新/);
assert.match(settings, /健康檢查/);
assert.match(notice, /有安全更新可用/);
assert.match(bootstrapRoute, /hashActivationKey/);
assert.match(bootstrapRoute, /access\.status !== "paid"/);
assert.match(bootstrapRoute, /x-erin-activation-key/);
assert.match(bootstrapRoute, /delivery/);
for (const installer of [macInstaller, windowsInstaller]) {
  assert.match(installer, /HOST_UPDATE_TOKEN|HostUpdateToken/);
  assert.match(installer, /installers\/bootstrap/);
  assert.match(installer, /updater/);
  assert.match(installer, /COMPOSE_PROJECT_NAME=erinerp/);
}
assert.match(macInstaller, /macOS 手動安裝程式/);
assert.match(macInstaller, /Mac with Apple silicon/);
assert.match(macInstaller, /Mac with Intel chip/);
assert.match(macInstaller, /route -n get default/);
assert.match(macInstaller, /請輸入這台 Mac 的區網 IPv4/);
assert.doesNotMatch(macInstaller, /LAN_IP=.*127\.0\.0\.1/);
assert.match(macInstaller, /艾琳 ERP\.app/);
assert.match(windowsInstaller, /ArgumentList "\/S"/);
assert.match(desktopMain, /ensureDesktopShortcut/);
assert.match(dockerfile, /ARG ERIN_RELEASE_SHA/);
assert.match(workflow, /ERIN_RELEASE_SHA=\$\{\{ github\.sha \}\}/);
assert.match(workflow, /candidate-\$\{\{ github\.sha \}\}/);
assert.match(workflow, /Promote verified image to latest/);
assert.match(workflow, /cancel-in-progress: false/);
assert.doesNotMatch(workflow, /type=raw,value=latest/);
assert.match(workflow, /Record released Host image version/);
assert.match(workflow, /Smoke test Apple Silicon Host startup/);

console.log("Manual Mac Host architecture/IP safeguards, candidate promotion, update center, signature recovery, updater rollback, and desktop bootstrap: PASS");
