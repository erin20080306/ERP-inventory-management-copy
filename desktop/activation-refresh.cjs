const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const {
  X509Certificate,
  createHash,
  createPublicKey,
  verify: cryptoVerify,
} = require("node:crypto");
const { app, safeStorage } = require("electron");

const CENTRAL_URL = "https://erp-inventory-management-copy.vercel.app";

function log(message, detail = "") {
  const line = `${new Date().toISOString()} ${message}${detail ? ` ${detail}` : ""}\n`;
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop-startup.log"), line);
  } catch {
    process.stderr.write(line);
  }
}

function configPath() {
  return path.join(app.getPath("userData"), "desktop-config.json");
}

function request(urlValue, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const request = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: options.method || "GET",
      headers: options.headers,
      timeout: options.timeout || 15_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode || 500,
        body: Buffer.concat(chunks),
      }));
    });
    request.on("timeout", () => request.destroy(new Error("連線逾時")));
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

function verifyDiscovery(envelope, publicKey) {
  if (!envelope || envelope.algorithm !== "ed25519" || !envelope.payload || !envelope.signature) {
    throw new Error("公司連線資料格式錯誤");
  }
  const key = createPublicKey({
    key: Buffer.from(publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  const verified = cryptoVerify(
    null,
    Buffer.from(stableJson(envelope.payload)),
    key,
    Buffer.from(envelope.signature, "base64url"),
  );
  if (!verified) throw new Error("公司連線資料簽章驗證失敗");

  const payload = envelope.payload;
  if (payload.type !== "ERIN_ERP_COMPANY_DISCOVERY_V1") throw new Error("公司連線資料版本錯誤");
  const issuedAt = new Date(String(payload.issuedAt || ""));
  const expiresAt = new Date(String(payload.expiresAt || ""));
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) throw new Error("公司連線資料日期錯誤");
  if (Date.now() < issuedAt.getTime() - 5 * 60_000 || Date.now() >= expiresAt.getTime()) {
    throw new Error("公司連線資料已過期");
  }

  const caCertificate = String(payload.caCertificate || "").trim();
  new X509Certificate(caCertificate);
  const fingerprint = createHash("sha256").update(caCertificate).digest("base64url");
  if (fingerprint !== payload.caFingerprint) throw new Error("公司主機憑證指紋不一致");

  const serverUrl = new URL(String(payload.serverUrl || ""));
  if (serverUrl.protocol !== "https:") throw new Error("公司主機網址格式錯誤");
  return {
    companyCode: String(payload.companyCode || ""),
    serverUrl: serverUrl.origin,
    caCertificate: `${caCertificate}\n`,
    discoveryVersion: Number(payload.discoveryVersion || 0),
  };
}

async function refreshActivationDiscovery() {
  const target = configPath();
  if (!fs.existsSync(target) || !safeStorage.isEncryptionAvailable()) return false;

  const config = JSON.parse(fs.readFileSync(target, "utf8"));
  if (!config.encryptedActivationKey) return false;
  const activationKey = safeStorage.decryptString(Buffer.from(config.encryptedActivationKey, "base64"));

  const keyResponse = await request(`${CENTRAL_URL}/api/license/public-key`, { timeout: 12_000 });
  if (keyResponse.status !== 200) throw new Error("中央公鑰讀取失敗");
  const body = JSON.stringify({ activationKey });
  const discoveryResponse = await request(`${CENTRAL_URL}/api/license/discover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
    timeout: 20_000,
  });
  if (discoveryResponse.status !== 200) {
    let detail = "";
    try { detail = JSON.parse(discoveryResponse.body.toString("utf8")).error || ""; } catch {}
    throw new Error(`公司連線資料更新失敗 (${discoveryResponse.status})${detail ? `：${detail}` : ""}`);
  }

  const responseBody = JSON.parse(discoveryResponse.body.toString("utf8"));
  const discovery = verifyDiscovery(responseBody.discovery, keyResponse.body.toString("utf8").trim());
  const changed = config.companyCode !== discovery.companyCode
    || config.serverUrl !== discovery.serverUrl
    || config.caCertificate !== discovery.caCertificate
    || Number(config.discoveryVersion || 0) !== discovery.discoveryVersion;
  if (!changed) return false;

  const temporary = `${target}.activation-refresh.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({
    ...config,
    ...discovery,
    discoveryCheckedAt: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 0o600); } catch {}
  log("activation-only company connection refreshed:", `${config.serverUrl || "unset"} -> ${discovery.serverUrl}`);
  return true;
}

module.exports = { refreshActivationDiscovery };
