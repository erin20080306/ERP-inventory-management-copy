const { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, session, shell } = require("electron");
const {
  X509Certificate,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign: cryptoSign,
  verify: cryptoVerify,
} = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");

const PRODUCTION_CENTRAL_URL = "https://erp-inventory-management-copy.vercel.app";
const CENTRAL_URL = app.isPackaged
  ? PRODUCTION_CENTRAL_URL
  : (process.env.ERIN_ERP_CENTRAL_URL || PRODUCTION_CENTRAL_URL).replace(/\/$/, "");
const REFRESH_INTERVAL_MS = 15 * 60_000;
const CONFIG_VERSION = 2;

let setupWindow = null;
let appWindow = null;
let customerDisplayWindow = null;
let proxyServer = null;
let proxyOrigin = null;
let upstreamConnection = null;
let lastRefreshAttempt = 0;

class ServiceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
  }
}

function configPath() {
  return path.join(app.getPath("userData"), "desktop-config.json");
}

function ensureDesktopShortcut() {
  if (process.platform !== "darwin" || !app.isPackaged) return;
  try {
    const appBundle = path.dirname(path.dirname(path.dirname(process.execPath)));
    if (!appBundle.endsWith(".app")) return;
    const shortcut = path.join(app.getPath("desktop"), "艾琳 ERP.app");
    if (!fs.existsSync(shortcut)) fs.symlinkSync(appBundle, shortcut, "dir");
  } catch (error) {
    console.error("desktop shortcut creation failed", error);
  }
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return { version: CONFIG_VERSION };
  }
}

function writeConfig(config) {
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 0o600); } catch {}
}

function encryptSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("作業系統安全儲存區尚未可用，無法保存啟用碼或裝置私鑰");
  return safeStorage.encryptString(value).toString("base64");
}

function decryptSecret(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) throw new Error("無法讀取作業系統安全儲存區");
  return safeStorage.decryptString(Buffer.from(value, "base64"));
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

function fingerprintDeviceId(value) {
  return createHash("sha256").update(value.trim()).digest("base64url");
}

function deviceIdFromPublicKey(publicKeyB64) {
  const key = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "ed25519") throw new Error("裝置金鑰格式錯誤");
  const normalized = key.export({ format: "der", type: "spki" });
  return `ERP-WS-${createHash("sha256").update(normalized).digest("base64url")}`;
}

function proofMaterial(input) {
  return [
    "ERIN-ERP-WORKSTATION-PROOF-V1",
    input.deviceFingerprint,
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
  ].join("\n");
}

function ensureIdentity(config) {
  if (config.deviceId && config.devicePublicKey && config.encryptedDevicePrivateKey) return config;
  const keyPair = generateKeyPairSync("ed25519");
  const publicKey = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const privateKey = keyPair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  return {
    ...config,
    version: CONFIG_VERSION,
    deviceId: deviceIdFromPublicKey(publicKey),
    devicePublicKey: publicKey,
    encryptedDevicePrivateKey: encryptSecret(privateKey),
  };
}

function normalizeServerUrl(value) {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "https:") throw new Error("公司主機必須使用 https:// 加密網址");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("公司主機網址只能包含 https://主機:連接埠");
  }
  return url.origin;
}

function validateCaCertificate(value) {
  const certificate = String(value || "").trim();
  if (!certificate.includes("BEGIN CERTIFICATE")) throw new Error("請選擇公司主機安裝器產生的 ca.crt");
  new X509Certificate(certificate);
  return `${certificate}\n`;
}

function hasHeader(headers, name) {
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === name.toLowerCase());
}

function hostInstallDirectory() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || app.getPath("userData"), "ErinERP");
  }
  return path.join(app.getPath("home"), "ErinERP");
}

function localHostInstallPresent() {
  const installDirectory = hostInstallDirectory();
  return fs.existsSync(path.join(installDirectory, "docker-compose.local.yml"))
    && fs.existsSync(path.join(installDirectory, ".env.local"));
}

function tlsRequestOptions(target, caCertificate, connectHostname) {
  const originalHostname = target.hostname;
  return {
    hostname: connectHostname || originalHostname,
    servername: net.isIP(originalHostname) ? undefined : originalHostname,
    checkServerIdentity: (_hostname, certificate) => tls.checkServerIdentity(originalHostname, certificate),
    agent: new https.Agent({ ca: caCertificate, keepAlive: true }),
  };
}

function requestBuffer(urlValue, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const transport = url.protocol === "https:" ? https : http;
    const connectHostname = options.connectHostname || url.hostname;
    const headers = { ...(options.headers || {}) };
    if (connectHostname !== url.hostname && !hasHeader(headers, "host")) headers.host = url.host;
    const secureOptions = url.protocol === "https:" && options.ca
      ? tlsRequestOptions(url, options.ca, connectHostname)
      : { hostname: connectHostname };
    const request = transport.request({
      protocol: url.protocol,
      ...secureOptions,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method || "GET",
      headers,
      timeout: options.timeout || 15_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode || 500,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on("timeout", () => request.destroy(new Error("連線逾時")));
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function requestJson(url, options = {}) {
  const response = await requestBuffer(url, options);
  let body;
  try { body = JSON.parse(response.body.toString("utf8")); } catch { body = null; }
  if (response.status < 200 || response.status >= 300) {
    throw new ServiceError(body?.error || `服務回覆 ${response.status}`, response.status);
  }
  return body;
}

function verifyCentralSignature(envelope, centralPublicKey) {
  if (!envelope || envelope.algorithm !== "ed25519") throw new Error("中央簽章格式錯誤");
  const key = createPublicKey({ key: Buffer.from(centralPublicKey, "base64"), format: "der", type: "spki" });
  if (!cryptoVerify(null, Buffer.from(stableJson(envelope.payload)), key, Buffer.from(envelope.signature, "base64url"))) {
    throw new Error("中央簽章驗證失敗");
  }
  return envelope.payload;
}

function verifyCentralLease(lease, centralPublicKey, config) {
  const payload = verifyCentralSignature(lease, centralPublicKey);
  if (payload.deviceRole !== "WORKSTATION") throw new Error("中央回覆的不是工作站席次");
  if (payload.devicePublicKey !== config.devicePublicKey) throw new Error("中央租約與本機裝置公鑰不一致");
  if (payload.deviceFingerprint !== fingerprintDeviceId(config.deviceId)) throw new Error("中央租約與本機裝置身分不一致");
  const issuedAt = new Date(String(payload.issuedAt || ""));
  const expiresAt = new Date(String(payload.expiresAt || ""));
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) throw new Error("中央租約日期錯誤");
  if (Date.now() < issuedAt.getTime() - 5 * 60_000 || Date.now() >= expiresAt.getTime()) throw new Error("工作站離線租約已到期");
  return expiresAt;
}

async function fetchCentralPublicKey() {
  const response = await requestBuffer(`${CENTRAL_URL}/api/license/public-key`, { timeout: 15_000 });
  if (response.status !== 200) throw new Error("中央授權公鑰尚未提供");
  return response.body.toString("utf8").trim();
}

function verifyCompanyDiscovery(discovery, centralPublicKey, requestedCompanyCode) {
  const payload = verifyCentralSignature(discovery, centralPublicKey);
  if (payload.type !== "ERIN_ERP_COMPANY_DISCOVERY_V1") throw new Error("中央公司連線資料格式錯誤");
  if (requestedCompanyCode && String(payload.companyCode || "").toUpperCase() !== requestedCompanyCode.trim().toUpperCase()) {
    throw new Error("中央公司代碼與輸入不一致");
  }
  const issuedAt = new Date(String(payload.issuedAt || ""));
  const expiresAt = new Date(String(payload.expiresAt || ""));
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) throw new Error("公司連線資料日期錯誤");
  if (Date.now() < issuedAt.getTime() - 5 * 60_000 || Date.now() >= expiresAt.getTime()) {
    throw new Error("公司連線資料已過期，請重新查詢");
  }
  const caCertificate = String(payload.caCertificate || "");
  const expectedFingerprint = createHash("sha256").update(caCertificate).digest("base64url");
  if (expectedFingerprint !== payload.caFingerprint) throw new Error("公司主機憑證指紋不一致");
  return {
    companyCode: String(payload.companyCode),
    tenantName: String(payload.tenantName || ""),
    serverUrl: normalizeServerUrl(String(payload.serverUrl || "")),
    caCertificate: validateCaCertificate(caCertificate),
    discoveryVersion: Number(payload.discoveryVersion || 0),
  };
}

async function discoverCompany(activationKey, companyCode = "") {
  const centralPublicKey = await fetchCentralPublicKey();
  const normalizedCompanyCode = companyCode.trim().toUpperCase();
  const body = JSON.stringify({
    activationKey,
    ...(normalizedCompanyCode ? { companyCode: normalizedCompanyCode } : {}),
  });
  const result = await requestJson(`${CENTRAL_URL}/api/license/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    body,
    timeout: 20_000,
  });
  return { ...verifyCompanyDiscovery(result.discovery, centralPublicKey, companyCode), centralPublicKey };
}

async function refreshLease(config) {
  const activationKey = decryptSecret(config.encryptedActivationKey);
  const centralPublicKey = await fetchCentralPublicKey();
  const body = JSON.stringify({
    activationKey,
    deviceId: config.deviceId,
    deviceRole: "WORKSTATION",
    devicePublicKey: config.devicePublicKey,
    displayName: os.hostname(),
    platform: process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux",
    appVersion: app.getVersion(),
  });
  const result = await requestJson(`${CENTRAL_URL}/api/license/lease`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    body,
    timeout: 20_000,
  });
  verifyCentralLease(result.lease, centralPublicKey, config);
  const next = {
    ...config,
    lease: result.lease,
    centralPublicKey,
    leaseCheckedAt: new Date().toISOString(),
  };
  writeConfig(next);
  return next;
}

async function ensureUsableLease({ forceRefresh = false } = {}) {
  let config = ensureIdentity(readConfig());
  if (!config.serverUrl || !config.caCertificate || !config.encryptedActivationKey) throw new Error("桌面客戶端尚未完成設定");
  const shouldRefresh = forceRefresh || !config.lease || Date.now() - lastRefreshAttempt >= REFRESH_INTERVAL_MS;
  if (shouldRefresh) {
    lastRefreshAttempt = Date.now();
    try {
      config = await refreshLease(config);
    } catch (error) {
      if (error instanceof ServiceError && [400, 401, 402, 403, 409].includes(error.status)) throw error;
      if (!config.lease || !config.centralPublicKey) throw error;
      verifyCentralLease(config.lease, config.centralPublicKey, config);
    }
  } else {
    verifyCentralLease(config.lease, config.centralPublicKey, config);
  }
  return config;
}

function privateDeviceKey(config) {
  return createPrivateKey({
    key: Buffer.from(decryptSecret(config.encryptedDevicePrivateKey), "base64"),
    format: "der",
    type: "pkcs8",
  });
}

function appPage(title, message, actions = "") {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="zh-Hant">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:48px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#07111f;color:#e5edf7}
  main{width:min(720px,100%);padding:34px;border:1px solid #334155;border-radius:20px;background:#0f172a;box-shadow:0 22px 60px rgba(0,0,0,.28)}
  h1{margin:0 0 18px;font-size:32px}p{margin:0 0 14px;line-height:1.7;color:#cbd5e1}.loader{width:34px;height:34px;margin-bottom:22px;border:4px solid #334155;border-top-color:#e2e8f0;border-radius:50%;animation:spin 1s linear infinite}
  .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}button{border:0;border-radius:10px;padding:11px 18px;font-size:16px;cursor:pointer}button.primary{background:#f8fafc;color:#0f172a}button.secondary{background:#334155;color:#f8fafc}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
<main>${actions ? "" : '<div class="loader"></div>'}<h1>${title}</h1><p>${message}</p>${actions}</main>
</html>`)}`;
}

function ensureAppWindow() {
  if (appWindow && !appWindow.isDestroyed()) return appWindow;
  appWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    title: "艾琳 ERP",
    backgroundColor: "#07111f",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "hardware-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  appWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (proxyOrigin && url.startsWith(proxyOrigin)) return { action: "allow" };
    if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  appWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("data:text/html") || (proxyOrigin && url.startsWith(proxyOrigin))) return;
    event.preventDefault();
    if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url);
  });
  appWindow.on("closed", () => { appWindow = null; });
  return appWindow;
}

async function showAppStatus(title, message) {
  const window = ensureAppWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  await window.loadURL(appPage(title, message));
}

async function showAppFailure(error) {
  const message = String(error?.message || error || "未知錯誤").replace(/[<>&]/g, "");
  const actions = `<div class="actions">
    <button class="primary" onclick="retry()">重新連線</button>
    <button class="secondary" onclick="settings()">連線設定</button>
  </div>
  <script>
    async function retry(){document.querySelector('main').innerHTML='<div class="loader"></div><h1>正在重新連線</h1><p>正在檢查 Docker Desktop 與公司主機，請稍候。</p>';await window.erinDesktop.retry();}
    async function settings(){await window.erinDesktop.openSettings();}
  </script>`;
  await ensureAppWindow().loadURL(appPage("無法連線公司主機", `${message}<br><br>程式會自動嘗試啟動本機公司主機；若仍失敗，請確認 Docker Desktop 已完成啟動。`, actions));
}

async function launchDockerDesktop() {
  if (process.platform === "darwin") {
    const target = "/Applications/Docker.app";
    if (!fs.existsSync(target)) return false;
    const result = await shell.openPath(target);
    return result === "";
  }
  if (process.platform === "win32") {
    const candidates = [
      path.join(process.env.ProgramFiles || "", "Docker", "Docker", "Docker Desktop.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Docker", "Docker Desktop.exe"),
    ].filter(Boolean);
    for (const target of candidates) {
      if (!fs.existsSync(target)) continue;
      const result = await shell.openPath(target);
      if (result === "") return true;
    }
  }
  return false;
}

async function probeHost(config, connectHostname, timeout = 6_000) {
  const target = new URL(config.serverUrl);
  const response = await requestBuffer(`${target.origin}/login`, {
    ca: config.caCertificate,
    connectHostname,
    timeout,
  });
  if (response.status < 200 || response.status >= 400) throw new Error(`公司主機回覆 ${response.status}`);
  return { serverUrl: config.serverUrl, connectHostname };
}

async function resolveUpstreamConnection(config, { force = false, startLocalHost = true } = {}) {
  if (!force && upstreamConnection?.serverUrl === config.serverUrl) return upstreamConnection;
  upstreamConnection = null;
  const target = new URL(config.serverUrl);
  const candidates = [target.hostname];
  if (localHostInstallPresent()) candidates.push("127.0.0.1");
  const uniqueCandidates = [...new Set(candidates)];
  try {
    upstreamConnection = await Promise.any(uniqueCandidates.map((hostname) => probeHost(config, hostname)));
    return upstreamConnection;
  } catch (initialError) {
    if (!startLocalHost || !localHostInstallPresent()) {
      throw new Error(`公司主機無法連線：${initialError?.errors?.[0]?.message || initialError?.message || "連線失敗"}`);
    }
  }

  await showAppStatus("正在啟動公司主機", "已偵測到本機公司主機，正在開啟 Docker Desktop 並等待 ERP 服務完成啟動，第一次可能需要 1～2 分鐘。");
  const launched = await launchDockerDesktop();
  if (!launched) throw new Error("找不到或無法開啟 Docker Desktop");

  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      upstreamConnection = await probeHost(config, "127.0.0.1", 4_000);
      return upstreamConnection;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(`Docker Desktop 已開啟，但公司主機仍未完成啟動：${lastError?.message || "等待逾時"}`);
}

function proxyFailure(response, error) {
  upstreamConnection = null;
  if (response.headersSent) return response.destroy();
  response.writeHead(502, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  const message = String(error?.message || error || "未知錯誤").replace(/[<>&]/g, "");
  response.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>連線失敗</title><style>body{font-family:system-ui;background:#07111f;color:#e5edf7;padding:48px}main{max-width:680px;margin:auto;padding:28px;border:1px solid #334155;border-radius:18px;background:#0f172a}.actions{display:flex;gap:12px;margin-top:20px}button{padding:10px 16px;border:0;border-radius:8px;cursor:pointer}</style><main><h1>無法連線公司主機</h1><p>${message}</p><p>可直接重新連線；程式會檢查並嘗試啟動本機 Docker Desktop。</p><div class="actions"><button onclick="retry()">重新連線</button><button onclick="settings()">連線設定</button></div><script>async function retry(){await window.erinDesktop.retry()}async function settings(){await window.erinDesktop.openSettings()}</script></main></html>`);
}

async function startProxy() {
  if (proxyServer && proxyOrigin) return proxyOrigin;
  const server = http.createServer((incoming, outgoing) => {
    void (async () => {
      const config = await ensureUsableLease();
      const target = new URL(config.serverUrl);
      const connection = await resolveUpstreamConnection(config, { startLocalHost: false });
      const requestPath = incoming.url || "/";
      const timestamp = String(Date.now());
      const nonce = randomBytes(18).toString("base64url");
      const deviceFingerprint = String(config.lease.payload.deviceFingerprint);
      const proof = cryptoSign(null, Buffer.from(proofMaterial({
        deviceFingerprint,
        method: incoming.method || "GET",
        path: requestPath,
        timestamp,
        nonce,
      })), privateDeviceKey(config)).toString("base64url");

      const headers = { ...incoming.headers };
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase().startsWith("x-erin-")) delete headers[name];
      }
      headers.host = target.host;
      headers["x-forwarded-proto"] = "https";
      headers["x-erin-original-method"] = incoming.method || "GET";
      headers["x-erin-original-path"] = requestPath;
      headers["x-erin-workstation-lease"] = Buffer.from(JSON.stringify(config.lease)).toString("base64url");
      headers["x-erin-workstation-time"] = timestamp;
      headers["x-erin-workstation-nonce"] = nonce;
      headers["x-erin-workstation-proof"] = proof;
      if (typeof headers.origin === "string" && proxyOrigin) headers.origin = headers.origin.replace(proxyOrigin, target.origin);
      if (typeof headers.referer === "string" && proxyOrigin) headers.referer = headers.referer.replace(proxyOrigin, target.origin);

      const upstream = https.request({
        protocol: target.protocol,
        ...tlsRequestOptions(target, config.caCertificate, connection.connectHostname),
        port: target.port || 443,
        method: incoming.method,
        path: requestPath,
        headers,
        timeout: 60_000,
      }, (response) => {
        const responseHeaders = { ...response.headers };
        if (typeof responseHeaders.location === "string" && proxyOrigin) {
          responseHeaders.location = responseHeaders.location.replace(target.origin, proxyOrigin);
        }
        outgoing.writeHead(response.statusCode || 502, responseHeaders);
        response.pipe(outgoing);
      });
      upstream.on("timeout", () => upstream.destroy(new Error("公司主機回應逾時")));
      upstream.on("error", (error) => proxyFailure(outgoing, error));
      incoming.pipe(upstream);
    })().catch((error) => proxyFailure(outgoing, error));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("無法建立桌面安全代理");
  proxyServer = server;
  proxyOrigin = `http://localhost:${address.port}`;
  return proxyOrigin;
}

function safeConfigView(config, error = null) {
  const expiresAt = config.lease?.payload?.expiresAt || null;
  return {
    configured: Boolean(config.serverUrl && config.caCertificate && config.encryptedActivationKey && config.lease && config.centralPublicKey),
    companyCode: config.companyCode || "",
    serverUrl: config.serverUrl || "",
    deviceId: config.deviceId || "",
    expiresAt,
    error,
  };
}

function createSetupWindow(error = null) {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show();
    setupWindow.webContents.send("desktop:error", error);
    return setupWindow;
  }
  setupWindow = new BrowserWindow({
    width: 720,
    height: 720,
    minWidth: 620,
    minHeight: 620,
    title: "艾琳 ERP 連線設定",
    backgroundColor: "#07111f",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.webContents.on("did-finish-load", () => {
    if (error) setupWindow?.webContents.send("desktop:error", error);
  });
  setupWindow.on("closed", () => { setupWindow = null; });
  return setupWindow;
}

async function openApplication({ forceReconnect = false } = {}) {
  ensureAppWindow();
  await showAppStatus("正在連線艾琳 ERP", "正在確認授權與公司主機狀態，請稍候。");
  try {
    const config = await ensureUsableLease({ forceRefresh: forceReconnect });
    await showAppStatus("正在連線公司主機", "正在確認公司主機服務；若 Docker Desktop 尚未啟動，程式會自動開啟。");
    await resolveUpstreamConnection(config, { force: forceReconnect, startLocalHost: true });
    const origin = await startProxy();
    await appWindow.loadURL(`${origin}/login`);
    setupWindow?.hide();
  } catch (error) {
    console.error("desktop application connection failed", error);
    await showAppFailure(error);
  }
}

function requireApplicationSender(event) {
  if (!appWindow || appWindow.isDestroyed() || event.sender.id !== appWindow.webContents.id) {
    throw new Error("硬體橋接只接受艾琳 ERP 主視窗呼叫");
  }
}

async function openCustomerDisplayWindow() {
  if (!proxyOrigin) await startProxy();
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.show();
    customerDisplayWindow.focus();
    return { ok: true, reused: true, displayCount: screen.getAllDisplays().length };
  }
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const target = displays.find((display) => display.id !== primary.id) || primary;
  const usingSecondary = target.id !== primary.id;
  customerDisplayWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: usingSecondary ? target.bounds.width : Math.min(1100, target.workArea.width),
    height: usingSecondary ? target.bounds.height : Math.min(760, target.workArea.height),
    fullscreen: usingSecondary,
    autoHideMenuBar: true,
    title: "艾琳 POS 客戶顯示器",
    backgroundColor: "#020617",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  customerDisplayWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  customerDisplayWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(proxyOrigin)) event.preventDefault();
  });
  customerDisplayWindow.on("closed", () => { customerDisplayWindow = null; });
  await customerDisplayWindow.loadURL(`${proxyOrigin}/pos/customer-display?desktop=1`);
  return { ok: true, reused: false, displayCount: displays.length, usingSecondary };
}

function registerIpc() {
  ipcMain.handle("desktop:state", () => safeConfigView(ensureIdentity(readConfig())));
  ipcMain.handle("desktop:choose-ca", async () => {
    const result = await dialog.showOpenDialog({
      title: "選擇公司主機 CA 憑證",
      properties: ["openFile"],
      filters: [{ name: "CA 憑證", extensions: ["crt", "pem"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return validateCaCertificate(fs.readFileSync(result.filePaths[0], "utf8"));
  });
  ipcMain.handle("desktop:save", async (_event, input) => {
    let config = ensureIdentity(readConfig());
    const activationKey = String(input.activationKey || "").trim();
    if (activationKey.length < 24) throw new Error("啟用碼格式錯誤");
    let companyCode = "";
    let serverUrl;
    let caCertificate;
    if (input.manualMode) {
      serverUrl = normalizeServerUrl(input.serverUrl);
      caCertificate = validateCaCertificate(input.caCertificate);
    } else {
      const discovered = await discoverCompany(activationKey);
      companyCode = discovered.companyCode;
      serverUrl = discovered.serverUrl;
      caCertificate = discovered.caCertificate;
    }
    config = {
      ...config,
      version: CONFIG_VERSION,
      companyCode,
      serverUrl,
      caCertificate,
      encryptedActivationKey: encryptSecret(activationKey),
      lease: null,
      centralPublicKey: null,
    };
    writeConfig(config);
    lastRefreshAttempt = 0;
    upstreamConnection = null;
    config = await refreshLease(config);
    await resolveUpstreamConnection(config, { force: true, startLocalHost: true });
    if (proxyServer) {
      await new Promise((resolve) => proxyServer.close(resolve));
      proxyServer = null;
      proxyOrigin = null;
    }
    return safeConfigView(config);
  });
  ipcMain.handle("desktop:open", async () => {
    await openApplication();
    return { ok: true };
  });
  ipcMain.handle("desktop:reset", async () => {
    const current = ensureIdentity(readConfig());
    writeConfig({
      version: CONFIG_VERSION,
      deviceId: current.deviceId,
      devicePublicKey: current.devicePublicKey,
      encryptedDevicePrivateKey: current.encryptedDevicePrivateKey,
    });
    lastRefreshAttempt = 0;
    upstreamConnection = null;
    appWindow?.close();
    return safeConfigView(readConfig());
  });
  ipcMain.handle("desktop:retry", async (event) => {
    requireApplicationSender(event);
    upstreamConnection = null;
    await openApplication({ forceReconnect: true });
    return { ok: true };
  });
  ipcMain.handle("desktop:open-settings", async (event) => {
    requireApplicationSender(event);
    createSetupWindow();
    return { ok: true };
  });
  ipcMain.handle("hardware:state", async (event) => {
    requireApplicationSender(event);
    return {
      desktop: true,
      platform: process.platform,
      appVersion: app.getVersion(),
      displayCount: screen.getAllDisplays().length,
      rawEscPosConfigured: false,
      paymentTerminalConfigured: false,
      note: "目前提供系統印表機偵測與雙螢幕客顯；原始 ESC/POS、錢櫃與刷卡機須在型號確定後安裝專用介接器。",
    };
  });
  ipcMain.handle("hardware:printers", async (event) => {
    requireApplicationSender(event);
    const printers = await event.sender.getPrintersAsync();
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName,
      description: printer.description,
      status: printer.status,
      isDefault: printer.isDefault,
    }));
  });
  ipcMain.handle("hardware:open-customer-display", async (event) => {
    requireApplicationSender(event);
    return openCustomerDisplayWindow();
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on("second-instance", () => {
    const window = appWindow || setupWindow;
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });

  app.whenReady().then(async () => {
    ensureDesktopShortcut();
    registerIpc();
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(permission === "media" && Boolean(proxyOrigin && webContents.getURL().startsWith(proxyOrigin)));
    });
    const config = ensureIdentity(readConfig());
    writeConfig(config);
    if (config.serverUrl && config.caCertificate && config.encryptedActivationKey) {
      await openApplication();
    } else createSetupWindow();
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length !== 0) return;
  const config = readConfig();
  if (config.serverUrl && config.caCertificate && config.encryptedActivationKey) void openApplication();
  else createSetupWindow();
});

app.on("before-quit", () => {
  customerDisplayWindow?.close();
  proxyServer?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
