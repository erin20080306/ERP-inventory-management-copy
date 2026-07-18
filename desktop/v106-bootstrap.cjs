const fs = require("node:fs");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { app, BrowserWindow, safeStorage, shell } = require("electron");

const CENTRAL_URL = "https://erp-inventory-management-copy.vercel.app";
let statusWindow = null;

function log(message, detail = "") {
  const line = `${new Date().toISOString()} ${message}${detail ? ` ${detail}` : ""}\n`;
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop-startup.log"), line);
  } catch {
    process.stderr.write(line);
  }
}

function hostDirectory() {
  return process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || app.getPath("userData"), "ErinERP")
    : path.join(app.getPath("home"), "ErinERP");
}

function desktopConfigPath() {
  return path.join(app.getPath("userData"), "desktop-config.json");
}

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function setEnv(source, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(source)
    ? source.replace(pattern, line)
    : `${source.replace(/\s*$/, "")}\n${line}\n`;
}

function currentLanIp() {
  const preferred = ["en0", "en1", "Wi-Fi", "Ethernet"];
  const addresses = [];
  for (const [name, values] of Object.entries(os.networkInterfaces())) {
    for (const value of values || []) {
      if (value.family !== "IPv4" || value.internal || value.address.startsWith("169.254.")) continue;
      addresses.push({ name, address: value.address });
    }
  }
  addresses.sort((left, right) => {
    const li = preferred.indexOf(left.name);
    const ri = preferred.indexOf(right.name);
    return (li < 0 ? 999 : li) - (ri < 0 ? 999 : ri);
  });
  return addresses[0]?.address || null;
}

function dockerBinary() {
  const candidates = process.platform === "darwin"
    ? [
      "/Applications/Docker.app/Contents/Resources/bin/docker",
      "/usr/local/bin/docker",
      "/opt/homebrew/bin/docker",
      path.join(app.getPath("home"), ".docker/bin/docker"),
    ]
    : [
      path.join(process.env.ProgramFiles || "", "Docker", "Docker", "resources", "bin", "docker.exe"),
      "docker.exe",
    ];
  return candidates.find((candidate) => candidate === "docker.exe" || fs.existsSync(candidate)) || null;
}

function run(command, args, cwd, timeout = 240_000) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `指令失敗 (${result.status})`);
  }
  return result.stdout || "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function showStatus(message) {
  if (!statusWindow || statusWindow.isDestroyed()) {
    statusWindow = new BrowserWindow({
      width: 640,
      height: 360,
      resizable: false,
      title: `艾琳 ERP v${app.getVersion()}`,
      backgroundColor: "#07111f",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
  }
  const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111f;color:#e5edf7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:30px;box-sizing:border-box}main{width:min(520px,100%);border:1px solid #334155;border-radius:18px;background:#0f172a;padding:28px;box-shadow:0 24px 70px #0008}h1{margin:0 0 14px}p{color:#cbd5e1;line-height:1.7}.loader{width:32px;height:32px;border:4px solid #334155;border-top-color:white;border-radius:50%;animation:s 1s linear infinite;margin-bottom:18px}@keyframes s{to{transform:rotate(360deg)}}</style><main><div class="loader"></div><h1>正在準備艾琳 ERP v${escapeHtml(app.getVersion())}</h1><p>${escapeHtml(message)}</p></main></html>`;
  await statusWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  statusWindow.show();
  statusWindow.focus();
}

function closeStatus() {
  if (statusWindow && !statusWindow.isDestroyed()) statusWindow.close();
  statusWindow = null;
}

async function ensureDocker(docker) {
  let result = spawnSync(docker, ["info"], { encoding: "utf8", timeout: 10_000, windowsHide: true });
  if (!result.error && result.status === 0) return;

  await showStatus("Docker Desktop 尚未啟動，正在自動開啟。第一次啟動可能需要 1～2 分鐘。");
  if (process.platform === "darwin" && fs.existsSync("/Applications/Docker.app")) {
    await shell.openPath("/Applications/Docker.app");
  } else if (process.platform === "win32") {
    const candidates = [
      path.join(process.env.ProgramFiles || "", "Docker", "Docker", "Docker Desktop.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Docker", "Docker Desktop.exe"),
    ];
    const target = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (target) await shell.openPath(target);
  }

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    result = spawnSync(docker, ["info"], { encoding: "utf8", timeout: 10_000, windowsHide: true });
    if (!result.error && result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Docker Desktop 尚未完成啟動");
}

function request(urlValue, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const headers = { ...(options.headers || {}) };
    if (options.hostHeader) headers.host = options.hostHeader;
    const req = https.request({
      hostname: options.connectHostname || url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: options.method || "GET",
      headers,
      servername: options.servername,
      rejectUnauthorized: options.rejectUnauthorized !== false,
      timeout: options.timeout || 15_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode || 500, body: Buffer.concat(chunks) }));
    });
    req.on("timeout", () => req.destroy(new Error("連線逾時")));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function hostAuthority(host) {
  return net.isIP(host) === 6 ? `[${host}]:3443` : `${host}:3443`;
}

async function waitForLocalHost(certificateHost) {
  const deadline = Date.now() + 180_000;
  let lastError = null;
  const authority = hostAuthority(certificateHost);
  while (Date.now() < deadline) {
    try {
      const response = await request(`https://${authority}/login`, {
        connectHostname: "127.0.0.1",
        hostHeader: authority,
        servername: net.isIP(certificateHost) ? undefined : certificateHost,
        rejectUnauthorized: false,
        timeout: 5_000,
      });
      if (response.status >= 200 && response.status < 500) return;
      lastError = new Error(`公司主機回覆 ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`本機公司主機啟動逾時：${lastError?.message || "無回應"}`);
}

function readDesktopConfig() {
  try {
    return JSON.parse(fs.readFileSync(desktopConfigPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeDesktopConfig(config) {
  const target = desktopConfigPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.v106.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 0o600); } catch {}
}

function extractLocalCa(docker, directory) {
  const temporary = path.join(app.getPath("temp"), `erin-erp-v106-ca-${process.pid}.crt`);
  try {
    run(docker, [
      "compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml",
      "cp", "caddy:/data/caddy/pki/authorities/local/root.crt", temporary,
    ], directory, 30_000);
    return fs.readFileSync(temporary, "utf8");
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

function syncLocalDesktopConfig(serverHost, caCertificate) {
  const target = desktopConfigPath();
  if (!fs.existsSync(target)) return false;
  const config = readDesktopConfig();
  if (!config.encryptedActivationKey) return false;
  const serverUrl = `https://${hostAuthority(serverHost)}`;
  const normalizedCa = `${String(caCertificate || "").trim()}\n`;
  if (config.serverUrl === serverUrl && config.caCertificate === normalizedCa) return false;
  writeDesktopConfig({
    ...config,
    serverUrl,
    caCertificate: normalizedCa,
    discoveryVersion: Number(config.discoveryVersion || 0) + 1,
    localHostUpdatedAt: new Date().toISOString(),
  });
  log("local desktop connection refreshed:", serverUrl);
  return true;
}

async function registerHostBestEffort(env, serverHost, caCertificate) {
  if (!env.LOCAL_ACTIVATION_KEY || !env.LOCAL_DEVICE_ID || !serverHost) return;
  const body = new URLSearchParams({
    activationKey: env.LOCAL_ACTIVATION_KEY,
    deviceId: env.LOCAL_DEVICE_ID,
    serverUrl: `https://${hostAuthority(serverHost)}`,
    caCertificateB64: Buffer.from(caCertificate).toString("base64"),
  }).toString();
  const response = await request(`${CENTRAL_URL}/api/license/register-server`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
    timeout: 25_000,
  });
  if (response.status < 200 || response.status >= 300) {
    let detail = "";
    try { detail = JSON.parse(response.body.toString("utf8")).error || ""; } catch {}
    throw new Error(`中央主機登錄失敗 (${response.status})${detail ? `：${detail}` : ""}`);
  }
  log("central host registration refreshed:", serverHost);
}

async function prepareLocalHost() {
  const directory = hostDirectory();
  const envFile = path.join(directory, ".env.local");
  const composeFile = path.join(directory, "docker-compose.local.yml");
  if (!fs.existsSync(envFile) || !fs.existsSync(composeFile)) return false;

  const docker = dockerBinary();
  if (!docker) throw new Error("找不到 Docker Desktop");
  await ensureDocker(docker);

  let env = parseEnv(envFile);
  let certificateHost = env.SERVER_HOST || currentLanIp() || "127.0.0.1";
  await showStatus("正在從本機 127.0.0.1 啟動公司主機，不再依賴目前 Wi‑Fi 的 IP。資料庫與既有資料都會保留。");
  run(docker, [
    "compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml", "up", "-d",
  ], directory, 300_000);
  await waitForLocalHost(certificateHost);

  const lanIp = currentLanIp();
  const newUrl = lanIp ? `https://${hostAuthority(lanIp)}` : null;
  const ipChanged = Boolean(lanIp && (env.SERVER_HOST !== lanIp || env.NEXTAUTH_URL !== newUrl));
  if (ipChanged) {
    await showStatus(`偵測到網路 IP 已變更為 ${lanIp}，正在背景更新主機憑證與其他工作站連線資料。`);
    let source = fs.readFileSync(envFile, "utf8");
    source = setEnv(source, "SERVER_HOST", lanIp);
    source = setEnv(source, "NEXTAUTH_URL", newUrl);
    const temporary = `${envFile}.v106-network.tmp`;
    fs.writeFileSync(temporary, source, { mode: 0o600 });
    fs.renameSync(temporary, envFile);
    run(docker, [
      "compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml",
      "up", "-d", "--force-recreate", "app", "caddy",
    ], directory, 300_000);
    certificateHost = lanIp;
    await waitForLocalHost(certificateHost);
    env = parseEnv(envFile);
  }

  const caCertificate = extractLocalCa(docker, directory);
  syncLocalDesktopConfig(certificateHost, caCertificate);
  try {
    await registerHostBestEffort(env, lanIp || certificateHost, caCertificate);
  } catch (error) {
    log("central registration deferred:", error?.message || String(error));
  }
  log("v1.0.6 local host ready:", certificateHost);
  return true;
}

function macBundle() {
  if (process.platform !== "darwin" || !app.isPackaged) return null;
  const bundle = path.dirname(path.dirname(path.dirname(process.execPath)));
  return bundle.endsWith(".app") ? bundle : null;
}

function plistBundleId(bundle) {
  try {
    const result = spawnSync("/usr/libexec/PlistBuddy", [
      "-c", "Print :CFBundleIdentifier", path.join(bundle, "Contents", "Info.plist"),
    ], { encoding: "utf8", timeout: 10_000 });
    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

function removeManagedDesktopItem(target) {
  if (!fs.existsSync(target)) return true;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target);
    return true;
  }
  const bundleId = plistBundleId(target);
  if (["design.erin.erp.desktop", "design.erin.erp.desktop.launcher"].includes(bundleId)) {
    fs.rmSync(target, { recursive: true, force: true });
    return true;
  }
  return false;
}

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function createDesktopLauncher(installedApp) {
  const desktop = app.getPath("desktop");
  let launcher = path.join(desktop, "艾琳 ERP.app");
  if (!removeManagedDesktopItem(launcher)) launcher = path.join(desktop, "艾琳 ERP 啟動器.app");
  fs.rmSync(launcher, { recursive: true, force: true });

  const contents = path.join(launcher, "Contents");
  const macos = path.join(contents, "MacOS");
  const resources = path.join(contents, "Resources");
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  const executableName = "ErinERPLauncher";
  const executable = path.join(macos, executableName);
  fs.writeFileSync(executable, `#!/bin/bash\nTARGET=${shellSingleQuote(installedApp)}\nif [ -d "$TARGET" ]; then\n  /usr/bin/open "$TARGET"\nelse\n  /usr/bin/open -a "艾琳 ERP"\nfi\n`, { mode: 0o755 });

  const sourceIcon = path.join(installedApp, "Contents", "Resources", "icon.icns");
  let iconEntry = "";
  if (fs.existsSync(sourceIcon)) {
    fs.copyFileSync(sourceIcon, path.join(resources, "ErinERP.icns"));
    iconEntry = "<key>CFBundleIconFile</key><string>ErinERP</string>";
  }

  const buildVersion = app.getVersion().replace(/\D/g, "") || "106";
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>CFBundlePackageType</key><string>APPL</string>\n<key>CFBundleExecutable</key><string>${executableName}</string>\n<key>CFBundleIdentifier</key><string>design.erin.erp.desktop.launcher</string>\n<key>CFBundleName</key><string>艾琳 ERP</string>\n<key>CFBundleDisplayName</key><string>艾琳 ERP</string>\n<key>CFBundleShortVersionString</key><string>${app.getVersion()}</string>\n<key>CFBundleVersion</key><string>${buildVersion}</string>\n${iconEntry}\n<key>LSMinimumSystemVersion</key><string>11.0</string>\n<key>NSHighResolutionCapable</key><true/>\n</dict></plist>\n`;
  fs.writeFileSync(path.join(contents, "Info.plist"), plist);
  spawnSync("/usr/bin/xattr", ["-dr", "com.apple.quarantine", launcher], { encoding: "utf8", timeout: 30_000 });
  spawnSync("/usr/bin/touch", [launcher], { encoding: "utf8", timeout: 10_000 });
  log("real desktop launcher ready:", `${launcher} -> ${installedApp}`);
}

function ensureMacInstallAndLauncher() {
  const source = macBundle();
  if (!source) return false;
  const homeApplications = path.join(app.getPath("home"), "Applications");
  const target = path.join(homeApplications, "艾琳 ERP.app");
  const realSource = fs.realpathSync(source);
  const stable = realSource.startsWith("/Applications/") || realSource.startsWith(`${homeApplications}/`);
  let installed = source;

  if (!stable) {
    fs.mkdirSync(homeApplications, { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    const copied = spawnSync("/usr/bin/ditto", [source, target], { encoding: "utf8", timeout: 180_000 });
    if (copied.error || copied.status !== 0) {
      throw new Error(copied.error?.message || copied.stderr || "無法安裝艾琳 ERP 到使用者應用程式");
    }
    spawnSync("/usr/bin/xattr", ["-dr", "com.apple.quarantine", target], { encoding: "utf8", timeout: 30_000 });
    installed = target;
  }

  createDesktopLauncher(installed);
  if (!stable) {
    const child = spawn("/usr/bin/open", [installed], { detached: true, stdio: "ignore" });
    child.unref();
    setTimeout(() => app.quit(), 500);
    return true;
  }
  return false;
}

async function start() {
  await app.whenReady();
  try {
    if (ensureMacInstallAndLauncher()) return;
  } catch (error) {
    log("v1.0.6 installation or desktop launcher failed:", error?.message || String(error));
  }

  try {
    await prepareLocalHost();
  } catch (error) {
    log("v1.0.6 local host preparation failed:", error?.message || String(error));
  }

  closeStatus();
  require("./bootstrap.cjs");
}

void start().catch((error) => {
  log("v1.0.6 bootstrap failed:", error?.message || String(error));
  closeStatus();
  require("./bootstrap.cjs");
});
