import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(path) {
  const content = readFileSync(path, "utf8");
  assert.ok(content.length > 0, `檔案不可為空：${path}`);
  return content;
}

const compose = read("docker-compose.local.yml");
const updater = read("updater/update.cgi");
const updaterDockerfile = read("updater/Dockerfile");
const updateRoute = read("src/app/api/system/update/route.ts");
const releaseRoute = read("src/app/api/releases/current/route.ts");
const publicKeyRoute = read("src/app/api/license/public-key/route.ts");
const bootstrapRoute = read("src/app/api/installers/bootstrap/route.ts");
const updateLibrary = read("src/lib/host-update.ts");
const signatureLibrary = read("src/lib/ed25519-signature.ts");
const settings = read("src/app/(app)/settings/client.tsx");
const notice = read("src/components/update-notice.tsx");
const macInstaller = read("installer/安裝艾琳ERP.command");
const windowsInstaller = read("installer/安裝艾琳ERP.ps1");
const desktopPackage = read("desktop/package.json");
const desktopSecurity = read("desktop/security-bootstrap.cjs");
const desktopRepair = read("desktop/runtime-repair.cjs");
const workflow = read(".github/workflows/publish-host-container-image.yml");
const dockerfile = read("Dockerfile");
const runtimeMode = read("src/app/api/runtime-mode/route.ts");
const rootLayout = read("src/app/layout.tsx");
const serviceWorkerRegister = read("src/components/sw-register.tsx");

const gitBin = join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin");
const shExecutable = process.platform === "win32" && existsSync(join(gitBin, "sh.exe")) ? join(gitBin, "sh.exe") : "sh";
const bashExecutable = process.platform === "win32" && existsSync(join(gitBin, "bash.exe")) ? join(gitBin, "bash.exe") : "bash";
execFileSync(shExecutable, ["-n", "updater/update.cgi"], { stdio: "pipe" });
execFileSync(bashExecutable, ["-n", "installer/安裝艾琳ERP.command"], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", "desktop/security-bootstrap.cjs"], { stdio: "pipe" });
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
assert.match(updater, /HTTP_X_ERIN_RELEASE_VERSION/);
assert.match(updater, /HTTP_X_ERIN_IMAGE_DIGEST/);
assert.match(updater, /target_image="\$\{IMAGE_REPOSITORY\}@\$\{image_digest\}"/);
assert.match(updater, /docker pull "\$target_image"/);
assert.match(updater, /write_env_image "\$target_image"/);
assert.match(updater, /rolling_back/);
assert.match(updater, /write_env_image "\$old_env_image"/);
assert.match(updater, /wait_for_app/);

assert.match(updateRoute, /createEncryptedDatabaseBackup/);
assert.match(updateRoute, /requirePermission\("settings\.manage"\)/);
assert.match(updateRoute, /latest\.version === currentVersion/);
assert.match(updateRoute, /triggerHostUpdater\(latest\)/);
assert.match(updateRoute, /targetDigest/);
const backupCallIndex = updateRoute.indexOf("backup = await createEncryptedDatabaseBackup()");
const currentVersionGuardIndex = updateRoute.indexOf("latest.version === currentVersion");
const updaterCallIndex = updateRoute.indexOf("void triggerHostUpdater(latest)");
assert.ok(backupCallIndex >= 0 && currentVersionGuardIndex >= 0 && updaterCallIndex >= 0);
assert.ok(backupCallIndex < updaterCallIndex);
assert.ok(currentVersionGuardIndex < updaterCallIndex);

assert.match(releaseRoute, /signOfflineLease/);
assert.match(releaseRoute, /ERIN_ERP_HOST_RELEASE_V1/);
assert.match(releaseRoute, /CURRENT_HOST_RELEASE/);
assert.match(releaseRoute, /imageDigest/);
assert.match(releaseRoute, /immutableImage/);
assert.match(releaseRoute, /Digest 發布/);
assert.doesNotMatch(releaseRoute, /VERCEL_GIT_COMMIT_SHA/);
assert.match(publicKeyRoute, /currentLicensePublicKeyB64/);
assert.match(publicKeyRoute, /Cache-Control": "no-store, max-age=0"/);
assert.match(signatureLibrary, /createPublicKey\(privateKey\)/);
assert.match(signatureLibrary, /verifySignedEnvelopeWithPublicKey/);
assert.match(updateLibrary, /verifyOfflineLease/);
assert.match(updateLibrary, /verifySignedEnvelopeWithPublicKey/);
assert.match(updateLibrary, /DIGEST_PATTERN/);
assert.match(updateLibrary, /immutableImage !== `\$\{IMAGE_REPOSITORY\}@\$\{imageDigest\}`/);
assert.match(updateLibrary, /X-Erin-Image-Digest/);
assert.match(updateLibrary, /背景更新服務無法連線/);

assert.match(desktopRepair, /scheduleUpdaterRepair/);
assert.match(desktopRepair, /--build", "--force-recreate", "updater/);
assert.match(desktopPackage, /"main": "security-bootstrap\.cjs"/);
assert.match(desktopSecurity, /app\.enableSandbox\(\)/);
assert.match(desktopSecurity, /will-attach-webview/);
assert.match(desktopSecurity, /v107-bootstrap\.cjs/);
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
assert.match(windowsInstaller, /ArgumentList "\/S"/);

assert.match(dockerfile, /FROM base AS production-deps/);
assert.match(dockerfile, /FROM base AS runtime-tools/);
assert.match(dockerfile, /COPY --from=build \/app\/\.next \.\/\.next/);
assert.doesNotMatch(dockerfile, /COPY --from=build \/app \.\//);
assert.match(workflow, /ERIN_RELEASE_SHA=\$\{\{ github\.sha \}\}/);
assert.match(workflow, /ubuntu-24\.04-arm/);
assert.match(workflow, /Capture immutable candidate Digest/);
assert.match(workflow, /--format '\{\{json \.Manifest\}\}'/);
assert.match(workflow, /JSON\.parse/);
assert.match(workflow, /Smoke test Apple Silicon Host startup/);
assert.match(workflow, /Promote verified Digest to latest compatibility tag/);
assert.match(workflow, /Record released Host image version and Digest/);
assert.match(workflow, /digest: \\"\$RELEASE_DIGEST\\"/);
assert.match(workflow, /cancel-in-progress: true/);
assert.doesNotMatch(workflow, /setup-qemu-action/);
assert.match(runtimeMode, /appVersion: currentRuntimeVersion\(\)/);
assert.match(rootLayout, /initialVersion=\{currentRuntimeVersion\(\)\}/);
assert.match(serviceWorkerRegister, /VERSION_CHECK_INTERVAL_MS = 60_000/);
assert.match(serviceWorkerRegister, /window\.location\.reload\(\)/);

console.log("Manual Host, immutable Digest release, updater rollback, Electron sandbox and slim runtime safeguards: PASS");
