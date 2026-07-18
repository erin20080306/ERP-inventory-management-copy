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
const os = require("node:os");
const path = require("node:path");

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

function requestBuffer(urlValue, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method || "GET",
      headers: options.headers,
      agent: url.protocol === "https:" && options.ca
        ? new https.Agent({ ca: options.ca, keepAlive: true })
        : undefined,
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
  if (String(payload.companyCode || "").toUpperCase() !== requestedCompanyCode.trim().toUpperCase()) {
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

async function discoverCompany(companyCode, activationKey) {
  const centralPublicKey = await fetchCentralPublicKey();
  const body = JSON.stringify({ companyCode: companyCode.trim().toUpperCase(), activationKey });
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

function proxyFailure(response, error) {
  if (response.headersSent) return response.destroy();
  response.writeHead(502, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>連線失敗</title><style>body{font-family:system-ui;background:#07111f;color:#e5edf7;padding:48px}main{max-width:680px;margin:auto;padding:28px;border:1px solid #334155;border-radius:18px;background:#0f172a}button{padding:10px 16px}</style><main><h1>無法連線公司主機</h1><p>${String(error?.message || error || "未知錯誤").replace(/[<>&]/g, "")}</p><p>請確認公司主機與網路正常，或由選單開啟「連線設定」。</p><button onclick="location.reload()">重新整理</button></main></html>`);
}

async function startProxy() {
  if (proxyServer && proxyOrigin) return proxyOrigin;
  const server = http.createServer((incoming, outgoing) => {
    void (async () => {
      const config = await ensureUsableLease();
      const target = new URL(config.serverUrl);
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
        hostname: target.hostname,
        port: target.port || 443,
        method: incoming.method,
        path: requestPath,
        headers,
        agent: new https.Agent({ ca: config.caCertificate, keepAlive: true }),
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

async function openApplication() {
  const origin = await startProxy();
  await ensureUsableLease();
  if (appWindow && !appWindow.isDestroyed()) {
    appWindow.show();
    appWindow.focus();
    return;
  }
  appWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    title: "艾琳 ERP",
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "hardware-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  appWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin)) return { action: "allow" };
    if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  appWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url);
    }
  });
  appWindow.loadURL(`${origin}/login`);
  appWindow.on("closed", () => { appWindow = null; });
  setupWindow?.hide();
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
      companyCode = String(input.companyCode || "").trim().toUpperCase();
      if (!/^[A-Z0-9-]{8,40}$/.test(companyCode)) throw new Error("公司代碼格式錯誤");
      const discovered = await discoverCompany(companyCode, activationKey);
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
    config = await refreshLease(config);
    const health = await requestBuffer(`${config.serverUrl}/login`, { ca: config.caCertificate, timeout: 15_000 });
    if (health.status < 200 || health.status >= 400) throw new Error(`公司主機回覆 ${health.status}`);
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
    appWindow?.close();
    return safeConfigView(readConfig());
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
      try { await openApplication(); } catch (error) { createSetupWindow(error?.message || String(error)); }
    } else createSetupWindow();
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createSetupWindow();
});

app.on("before-quit", () => {
  customerDisplayWindow?.close();
  proxyServer?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
