const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { X509Certificate, createHash, createPublicKey, verify: cryptoVerify } = require("node:crypto");
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

function hostDir() {
  return process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || app.getPath("userData"), "ErinERP")
    : path.join(app.getPath("home"), "ErinERP");
}

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }));
}

function setEnv(source, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(source) ? source.replace(pattern, line) : `${source.replace(/\s*$/, "")}\n${line}\n`;
}

function lanIp() {
  const preferred = ["en0", "en1", "Wi-Fi", "Ethernet"];
  const addresses = [];
  for (const [name, values] of Object.entries(os.networkInterfaces())) {
    for (const value of values || []) {
      if (value.family !== "IPv4" || value.internal || value.address.startsWith("169.254.")) continue;
      addresses.push({ name, address: value.address });
    }
  }
  addresses.sort((a, b) => {
    const ai = preferred.indexOf(a.name);
    const bi = preferred.indexOf(b.name);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
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
  return candidates.find((item) => item === "docker.exe" || fs.existsSync(item)) || null;
}

function run(docker, args, cwd, timeout = 180_000) {
  const result = spawnSync(docker, args, { cwd, encoding: "utf8", timeout, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `Docker 指令失敗 (${result.status})`);
  }
  return result.stdout || "";
}

async function ensureDocker(docker) {
  let result = spawnSync(docker, ["info"], { encoding: "utf8", timeout: 10_000, windowsHide: true });
  if (!result.error && result.status === 0) return;
  if (process.platform === "darwin" && fs.existsSync("/Applications/Docker.app")) {
    await shell.openPath("/Applications/Docker.app");
  } else if (process.platform === "win32") {
    const target = path.join(process.env.ProgramFiles || "", "Docker", "Docker", "Docker Desktop.exe");
    if (fs.existsSync(target)) await shell.openPath(target);
  }
  const deadline = Date.now() + 120_000;
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
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: options.method || "GET",
      headers: options.headers,
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

async function showStatus(message) {
  if (!statusWindow || statusWindow.isDestroyed()) {
    statusWindow = new BrowserWindow({
      width: 620,
      height: 350,
      resizable: false,
      title: "艾琳 ERP 自動修復",
      backgroundColor: "#07111f",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
  }
  const safe = String(message).replace(/[&<>]/g, "");
  const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111f;color:#e5edf7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:30px;box-sizing:border-box}main{border:1px solid #334155;border-radius:18px;background:#0f172a;padding:28px}h1{margin:0 0 14px}p{color:#cbd5e1;line-height:1.7}.loader{width:32px;height:32px;border:4px solid #334155;border-top-color:white;border-radius:50%;animation:s 1s linear infinite;margin-bottom:18px}@keyframes s{to{transform:rotate(360deg)}}</style><main><div class="loader"></div><h1>正在自動修復 ERP 連線</h1><p>${safe}</p></main></html>`;
  await statusWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  statusWindow.show();
}

async function waitHost(ip) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await request(`https://${ip}:3443/login`, { rejectUnauthorized: false, timeout: 4_000 });
      if (response.status >= 200 && response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("公司主機在更新 IP 後仍未完成啟動");
}

async function registerHost(env, ip, ca) {
  const body = new URLSearchParams({
    activationKey: env.LOCAL_ACTIVATION_KEY,
    deviceId: env.LOCAL_DEVICE_ID,
    serverUrl: `https://${ip}:3443`,
    caCertificateB64: Buffer.from(ca).toString("base64"),
  }).toString();
  const response = await request(`${CENTRAL_URL}/api/license/register-server`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    body,
    timeout: 20_000,
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`中央主機登錄失敗 (${response.status})`);
}

async function repairHostIp() {
  const directory = hostDir();
  const envFile = path.join(directory, ".env.local");
  const composeFile = path.join(directory, "docker-compose.local.yml");
  if (!fs.existsSync(envFile) || !fs.existsSync(composeFile)) return false;
  const ip = lanIp();
  const env = parseEnv(envFile);
  if (!ip || !env.SERVER_HOST || env.SERVER_HOST === ip) return false;

  await showStatus(`偵測到主機網路由 ${env.SERVER_HOST} 變更為 ${ip}，正在自動更新，不需重新安裝。`);
  let source = fs.readFileSync(envFile, "utf8");
  source = setEnv(source, "SERVER_HOST", ip);
  source = setEnv(source, "NEXTAUTH_URL", `https://${ip}:3443`);
  const temp = `${envFile}.network.tmp`;
  fs.writeFileSync(temp, source, { mode: 0o600 });
  fs.renameSync(temp, envFile);

  const docker = dockerBinary();
  if (!docker) throw new Error("找不到 Docker Desktop");
  await ensureDocker(docker);
  run(docker, ["compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml", "up", "-d", "--force-recreate", "app", "caddy"], directory);
  await waitHost(ip);

  const caFile = path.join(app.getPath("temp"), `erin-erp-ca-${process.pid}.crt`);
  run(docker, ["compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml", "cp", "caddy:/data/caddy/pki/authorities/local/root.crt", caFile], directory, 30_000);
  const ca = fs.readFileSync(caFile, "utf8");
  try { fs.unlinkSync(caFile); } catch {}
  await registerHost(parseEnv(envFile), ip, ca);
  log("automatic host IP repair completed:", ip);
  return true;
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function verifyDiscovery(envelope, publicKey, companyCode) {
  if (!envelope || envelope.algorithm !== "ed25519") throw new Error("公司連線資料格式錯誤");
  const key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  if (!cryptoVerify(null, Buffer.from(stableJson(envelope.payload)), key, Buffer.from(envelope.signature, "base64url"))) {
    throw new Error("公司連線資料簽章驗證失敗");
  }
  const payload = envelope.payload;
  if (payload.type !== "ERIN_ERP_COMPANY_DISCOVERY_V1") throw new Error("公司連線資料版本錯誤");
  if (String(payload.companyCode || "").toUpperCase() !== String(companyCode).toUpperCase()) throw new Error("公司代碼不一致");
  const expiresAt = new Date(String(payload.expiresAt || ""));
  if (Number.isNaN(expiresAt.getTime()) || Date.now() >= expiresAt.getTime()) throw new Error("公司連線資料已過期");
  const ca = String(payload.caCertificate || "").trim();
  new X509Certificate(ca);
  if (createHash("sha256").update(ca).digest("base64url") !== payload.caFingerprint) throw new Error("CA 指紋不一致");
  return {
    serverUrl: new URL(String(payload.serverUrl || "")).origin,
    caCertificate: `${ca}\n`,
    discoveryVersion: Number(payload.discoveryVersion || 0),
  };
}

async function refreshDiscovery() {
  const file = path.join(app.getPath("userData"), "desktop-config.json");
  if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) return false;
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!config.companyCode || !config.encryptedActivationKey) return false;
  const activationKey = safeStorage.decryptString(Buffer.from(config.encryptedActivationKey, "base64"));
  const keyResponse = await request(`${CENTRAL_URL}/api/license/public-key`, { timeout: 12_000 });
  if (keyResponse.status !== 200) throw new Error("中央公鑰讀取失敗");
  const body = JSON.stringify({ companyCode: config.companyCode, activationKey });
  const response = await request(`${CENTRAL_URL}/api/license/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    body,
    timeout: 20_000,
  });
  if (response.status !== 200) throw new Error(`公司連線資料更新失敗 (${response.status})`);
  const discovery = verifyDiscovery(JSON.parse(response.body.toString("utf8")).discovery, keyResponse.body.toString("utf8").trim(), config.companyCode);
  if (config.serverUrl === discovery.serverUrl && config.caCertificate === discovery.caCertificate) return false;
  const temp = `${file}.discovery.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ ...config, ...discovery }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  log("desktop server address refreshed:", `${config.serverUrl || "unset"} -> ${discovery.serverUrl}`);
  return true;
}

function macBundle() {
  if (process.platform !== "darwin" || !app.isPackaged) return null;
  const bundle = path.dirname(path.dirname(path.dirname(process.execPath)));
  return bundle.endsWith(".app") ? bundle : null;
}

function ensureMacInstall() {
  const source = macBundle();
  if (!source) return false;
  const homeApps = path.join(app.getPath("home"), "Applications");
  const target = path.join(homeApps, "艾琳 ERP.app");
  const desktop = path.join(app.getPath("desktop"), "艾琳 ERP.app");
  const realSource = fs.realpathSync(source);
  const stable = realSource.startsWith("/Applications/") || realSource.startsWith(`${homeApps}/`);
  let installed = source;
  if (!stable) {
    fs.mkdirSync(homeApps, { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    const copied = spawnSync("/usr/bin/ditto", [source, target], { encoding: "utf8", timeout: 120_000 });
    if (copied.error || copied.status !== 0) throw new Error(copied.error?.message || copied.stderr || "無法複製 ERP App");
    spawnSync("/usr/bin/xattr", ["-dr", "com.apple.quarantine", target], { encoding: "utf8", timeout: 30_000 });
    installed = target;
  }
  if (fs.existsSync(desktop)) {
    const stat = fs.lstatSync(desktop);
    if (stat.isSymbolicLink()) fs.unlinkSync(desktop);
    else return !stable;
  }
  fs.symlinkSync(installed, desktop, "dir");
  log("desktop ERP icon ready:", desktop);
  if (!stable) {
    const child = spawn("/usr/bin/open", [installed], { detached: true, stdio: "ignore" });
    child.unref();
    setTimeout(() => app.quit(), 300);
    return true;
  }
  return false;
}

async function start() {
  await app.whenReady();
  try {
    if (ensureMacInstall()) return;
  } catch (error) {
    log("automatic app installation failed:", error?.message || String(error));
  }
  try { await repairHostIp(); } catch (error) { log("automatic host IP repair failed:", error?.message || String(error)); }
  try { await refreshDiscovery(); } catch (error) { log("automatic discovery refresh skipped:", error?.message || String(error)); }
  if (statusWindow && !statusWindow.isDestroyed()) statusWindow.close();
  require("./bootstrap.cjs");
}

void start().catch((error) => {
  log("network bootstrap failed:", error?.message || String(error));
  require("./bootstrap.cjs");
});
