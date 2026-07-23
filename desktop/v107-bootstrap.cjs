const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { app } = require("electron");
const { refreshActivationDiscovery } = require("./activation-refresh.cjs");
const { repairWorkstationIdentity, scheduleUpdaterRepair } = require("./runtime-repair.cjs");

function log(message, detail = "") {
  const line = `${new Date().toISOString()} ${message}${detail ? ` ${detail}` : ""}\n`;
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop-startup.log"), line);
  } catch {
    process.stderr.write(line);
  }
}

function run(command, args, timeout = 180_000) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
}

function macBundle() {
  if (process.platform !== "darwin" || !app.isPackaged) return null;
  const bundle = path.dirname(path.dirname(path.dirname(process.execPath)));
  return bundle.endsWith(".app") ? bundle : null;
}

function isStableInstall(bundle) {
  if (!bundle) return true;
  const homeApplications = path.join(app.getPath("home"), "Applications");
  let realBundle = bundle;
  try { realBundle = fs.realpathSync(bundle); } catch {}
  return realBundle.startsWith("/Applications/") || realBundle.startsWith(`${homeApplications}/`);
}

function hostFilesPresent(directory) {
  return fs.existsSync(path.join(directory, ".env.local"))
    && fs.existsSync(path.join(directory, "docker-compose.local.yml"));
}

function ensureWindowsHostPathCompatibility() {
  if (process.platform !== "win32") return "not-windows";

  const userProfileRoot = process.env.USERPROFILE || app.getPath("home");
  const localAppDataRoot = process.env.LOCALAPPDATA || app.getPath("userData");
  const userProfileHost = path.join(userProfileRoot, "ErinERP");
  const localAppDataHost = path.join(localAppDataRoot, "ErinERP");
  const userProfileReady = hostFilesPresent(userProfileHost);
  const localAppDataReady = hostFilesPresent(localAppDataHost);

  if (userProfileReady && localAppDataReady) {
    try {
      if (fs.realpathSync(userProfileHost) === fs.realpathSync(localAppDataHost)) return "already-linked";
    } catch {}
    log("Windows Host paths both contain installations; keeping both:", `${userProfileHost} | ${localAppDataHost}`);
    return "both-present";
  }

  if (userProfileReady && !fs.existsSync(localAppDataHost)) {
    fs.mkdirSync(path.dirname(localAppDataHost), { recursive: true });
    fs.symlinkSync(userProfileHost, localAppDataHost, "junction");
    log("linked Windows Host compatibility path:", `${localAppDataHost} -> ${userProfileHost}`);
    return "linked-localappdata-to-userprofile";
  }

  if (localAppDataReady && !fs.existsSync(userProfileHost)) {
    fs.mkdirSync(path.dirname(userProfileHost), { recursive: true });
    fs.symlinkSync(localAppDataHost, userProfileHost, "junction");
    log("linked Windows Host compatibility path:", `${userProfileHost} -> ${localAppDataHost}`);
    return "linked-userprofile-to-localappdata";
  }

  return "not-installed";
}

function adHocSign(bundle) {
  if (!bundle || !fs.existsSync(bundle)) return false;
  const result = run("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--timestamp=none",
    bundle,
  ], 120_000);
  if (result.error || result.status !== 0) {
    log("ad-hoc signing failed:", result.error?.message || result.stderr || String(result.status));
    return false;
  }
  const verify = run("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    bundle,
  ], 60_000);
  if (verify.error || verify.status !== 0) {
    log("ad-hoc signature verification failed:", verify.error?.message || verify.stderr || String(verify.status));
    return false;
  }
  return true;
}

function installFromDownloadedLocation(source) {
  const homeApplications = path.join(app.getPath("home"), "Applications");
  const target = path.join(homeApplications, "艾琳 ERP.app");
  fs.mkdirSync(homeApplications, { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });

  const copied = run("/usr/bin/ditto", [source, target]);
  if (copied.error || copied.status !== 0) {
    throw new Error(copied.error?.message || copied.stderr || "無法安裝艾琳 ERP 到使用者應用程式");
  }
  run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", target], 30_000);

  const verify = run("/usr/bin/codesign", ["--verify", "--deep", "--strict", target], 60_000);
  if (verify.error || verify.status !== 0) adHocSign(target);

  log("v1.0.8 app installed:", target);
  const child = spawn("/usr/bin/open", ["-n", target], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  setTimeout(() => app.quit(), 1_000);
  return true;
}

function launcherCandidates() {
  const desktop = app.getPath("desktop");
  return [
    path.join(desktop, "艾琳 ERP.app"),
    path.join(desktop, "艾琳 ERP 啟動器.app"),
  ];
}

function launcherBundleId(bundle) {
  const plist = path.join(bundle, "Contents", "Info.plist");
  if (!fs.existsSync(plist)) return "";
  const result = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist], 10_000);
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

function signDesktopLauncherWhenCreated() {
  if (process.platform !== "darwin") return;
  let lastSignatureKey = "";
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    try {
      const launcher = launcherCandidates().find((candidate) =>
        fs.existsSync(candidate) && launcherBundleId(candidate) === "design.erin.erp.desktop.launcher");
      if (launcher) {
        const stat = fs.statSync(path.join(launcher, "Contents", "Info.plist"));
        const signatureKey = `${launcher}:${stat.mtimeMs}:${app.getVersion()}`;
        if (signatureKey !== lastSignatureKey) {
          run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", launcher], 30_000);
          if (adHocSign(launcher)) {
            lastSignatureKey = signatureKey;
            run("/usr/bin/touch", [launcher], 10_000);
            log("signed desktop launcher ready:", launcher);
          }
        }
      }
    } catch (error) {
      log("desktop launcher signing retry failed:", error?.message || String(error));
    }
    if (attempts >= 60) clearInterval(timer);
  }, 500);
  timer.unref?.();
}

async function start() {
  await app.whenReady();
  try {
    repairWorkstationIdentity();
  } catch (error) {
    log("workstation signing identity repair failed:", error?.message || String(error));
  }
  try {
    ensureWindowsHostPathCompatibility();
  } catch (error) {
    log("Windows Host path compatibility repair failed:", error?.message || String(error));
  }
  scheduleUpdaterRepair();

  const bundle = macBundle();
  if (bundle && !isStableInstall(bundle)) {
    try {
      installFromDownloadedLocation(bundle);
      return;
    } catch (error) {
      log("v1.0.8 installation failed:", error?.message || String(error));
    }
  }

  try {
    await refreshActivationDiscovery();
  } catch (error) {
    log("activation-only discovery refresh deferred:", error?.message || String(error));
  }

  signDesktopLauncherWhenCreated();
  require("./v106-bootstrap.cjs");
}

void start().catch((error) => {
  log("v1.0.8 bootstrap failed:", error?.message || String(error));
  require("./v106-bootstrap.cjs");
});