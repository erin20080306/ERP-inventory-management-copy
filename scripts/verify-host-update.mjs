import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const compose = readFileSync("docker-compose.local.yml", "utf8");
const updater = readFileSync("updater/update.cgi", "utf8");
const updaterDockerfile = readFileSync("updater/Dockerfile", "utf8");
const updateRoute = readFileSync("src/app/api/system/update/route.ts", "utf8");
const releaseRoute = readFileSync("src/app/api/releases/current/route.ts", "utf8");
const bootstrapRoute = readFileSync("src/app/api/installers/bootstrap/route.ts", "utf8");
const updateLibrary = readFileSync("src/lib/host-update.ts", "utf8");
const settings = readFileSync("src/app/(app)/settings/client.tsx", "utf8");
const notice = readFileSync("src/components/update-notice.tsx", "utf8");
const macInstaller = readFileSync("installer/安裝艾琳ERP.command", "utf8");
const windowsInstaller = readFileSync("installer/安裝艾琳ERP.ps1", "utf8");
const desktopMain = readFileSync("desktop/main.cjs", "utf8");
const workflow = readFileSync(".github/workflows/release-desktop.yml", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");

execFileSync("sh", ["-n", "updater/update.cgi"], { stdio: "pipe" });
execFileSync("bash", ["-n", "installer/安裝艾琳ERP.command"], { stdio: "pipe" });

assert.match(compose, /updater:/);
assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
assert.match(compose, /no-new-privileges:true/);
assert.match(compose, /erp_update_state/);
assert.match(compose, /HOST_UPDATE_TOKEN/);
const updaterService = compose.split("\n  updater:\n")[1]?.split("\n  backup:\n")[0] || "";
assert.ok(updaterService.length > 0);
assert.doesNotMatch(updaterService, /\n\s+ports:/);
assert.match(updaterDockerfile, /docker-cli-compose/);
assert.match(updater, /compose pull app backup/);
assert.match(updater, /create|pulling/);
assert.match(updater, /rolling_back/);
assert.match(updater, /docker image tag/);
assert.match(updater, /wait_for_app/);
assert.match(updateRoute, /createEncryptedDatabaseBackup/);
assert.ok(updateRoute.indexOf("createEncryptedDatabaseBackup") < updateRoute.indexOf("triggerHostUpdater"));
assert.match(updateRoute, /requirePermission\("settings\.manage"\)/);
assert.match(releaseRoute, /signOfflineLease/);
assert.match(releaseRoute, /ERIN_ERP_HOST_RELEASE_V1/);
assert.match(updateLibrary, /verifyOfflineLease/);
assert.match(updateLibrary, /image !== IMAGE/);
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
assert.match(macInstaller, /艾琳 ERP\.app/);
assert.match(windowsInstaller, /ArgumentList "\/S"/);
assert.match(desktopMain, /ensureDesktopShortcut/);
assert.match(dockerfile, /ARG ERIN_RELEASE_SHA/);
assert.match(workflow, /ERIN_RELEASE_SHA=\$\{\{ github\.sha \}\}/);

console.log("Host update center, rollback, and desktop bootstrap: PASS");
