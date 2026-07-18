const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const tls = require("node:tls");
const { app, BrowserWindow, shell } = require("electron");

function appendStartupLog(message, detail = "") {
  const line = `${new Date().toISOString()} ${message}${detail ? ` ${detail}` : ""}\n`;
  try {
    if (app.isReady()) {
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
      fs.appendFileSync(path.join(app.getPath("userData"), "desktop-startup.log"), line);
      return;
    }
  } catch {}
  process.stderr.write(line);
}

function replaceHeader(headers, name, value) {
  const next = { ...(headers || {}) };
  for (const key of Object.keys(next)) {
    if (key.toLowerCase() === name.toLowerCase()) delete next[key];
  }
  next[name] = value;
  return next;
}

function readHeader(headers, name) {
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === name.toLowerCase()) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function replaceOriginHeader(headers, name, fromOrigin, toOrigin) {
  const value = readHeader(headers, name);
  if (typeof value !== "string" || !value.startsWith(fromOrigin)) return headers;
  return replaceHeader(headers, name, `${toOrigin}${value.slice(fromOrigin.length)}`);
}

function hostInstallDirectory() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || app.getPath("userData"), "ErinERP");
  }
  return path.join(app.getPath("home"), "ErinERP");
}

function localHostTlsRoute(options) {
  try {
    const connectHostname = String(options.hostname || options.host || "").replace(/^\[|\]$/g, "");
    if (!["127.0.0.1", "::1", "localhost"].includes(connectHostname)) return null;

    const envPath = path.join(hostInstallDirectory(), ".env.local");
    const composePath = path.join(hostInstallDirectory(), "docker-compose.local.yml");
    if (!fs.existsSync(envPath) || !fs.existsSync(composePath)) return null;

    const env = Object.fromEntries(
      fs.readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    const certificateHost = String(env.SERVER_HOST || "").trim();
    if (!certificateHost) return null;

    const originalAuthority = String(readHeader(options.headers, "host") || "").trim();
    if (!originalAuthority) return null;
    const requested = new URL(`https://${originalAuthority}`);
    const expectedPort = String(env.ERP_HTTPS_PORT || "3443").trim();
    const requestedPort = requested.port || "443";
    if (requestedPort !== expectedPort) return null;

    const certificateAuthority = net.isIP(certificateHost) === 6
      ? `[${certificateHost}]:${requestedPort}`
      : `${certificateHost}:${requestedPort}`;
    const requestedOrigin = requested.origin;
    const certificateOrigin = `https://${certificateAuthority}`;

    let headers = replaceHeader(options.headers, "host", certificateAuthority);
    headers = replaceOriginHeader(headers, "origin", requestedOrigin, certificateOrigin);
    headers = replaceOriginHeader(headers, "referer", requestedOrigin, certificateOrigin);

    return {
      options: {
        ...options,
        headers,
        servername: net.isIP(certificateHost) ? undefined : certificateHost,
        checkServerIdentity: (_hostname, certificate) => tls.checkServerIdentity(certificateHost, certificate),
      },
      requestedOrigin,
      certificateOrigin,
      certificateHost,
    };
  } catch (error) {
    appendStartupLog("local host TLS compatibility check failed:", error?.message || String(error));
    return null;
  }
}

// Caddy may select zstd/gzip from Chromium's Accept-Encoding header. The desktop
// proxy forwards the response body byte-for-byte, so request identity encoding
// to avoid a renderer-side content decoding failure and a completely white page.
// When the Mac changes Wi-Fi networks, the current company-host IP can differ
// from the IP stored in Caddy's existing certificate. For loopback connections
// only, keep full CA and hostname verification against the certificate's original
// SERVER_HOST while translating Host/Origin/redirect headers for the new address.
const originalHttpsRequest = https.request;
https.request = function patchedHttpsRequest(options, callback) {
  if (options && typeof options === "object" && !(options instanceof URL)) {
    const route = localHostTlsRoute(options);
    const baseOptions = route?.options || options;
    const patchedOptions = {
      ...baseOptions,
      headers: replaceHeader(baseOptions.headers, "accept-encoding", "identity"),
    };
    const patchedCallback = route && typeof callback === "function"
      ? (response) => {
        const location = response?.headers?.location;
        if (typeof location === "string" && location.startsWith(route.certificateOrigin)) {
          response.headers.location = `${route.requestedOrigin}${location.slice(route.certificateOrigin.length)}`;
        }
        callback(response);
      }
      : callback;
    if (route) appendStartupLog("using local host certificate route:", `${route.certificateHost} -> ${route.requestedOrigin}`);
    return originalHttpsRequest.call(this, patchedOptions, patchedCallback);
  }
  return originalHttpsRequest.apply(this, arguments);
};

function configuredServerOrigin() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "desktop-config.json"), "utf8"));
    return new URL(String(config.serverUrl || "")).origin;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function showLoadFailure(window, originalUrl, message) {
  if (!window || window.isDestroyed()) return;
  appendStartupLog("desktop page load failed:", String(message || "unknown error"));
  const safeMessage = escapeHtml(message || "未知錯誤");
  const safeUrl = escapeHtml(originalUrl);
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#07111f;color:#e5edf7;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}main{width:min(680px,100%);border:1px solid #334155;border-radius:18px;background:#0f172a;padding:28px;box-shadow:0 24px 80px #0008}h1{margin:0 0 14px;font-size:26px}p{line-height:1.7;color:#cbd5e1;word-break:break-word}.error{border-radius:12px;background:#450a0a;color:#fecaca;padding:12px}.url{font-size:12px;color:#94a3b8}button{border:0;border-radius:10px;padding:11px 16px;background:#4f46e5;color:white;font-weight:700;cursor:pointer}</style></head><body><main><h1>艾琳 ERP 畫面載入失敗</h1><p>公司主機可能仍在啟動，或桌面代理收到無法解碼的網頁內容。這個版本已保留診斷紀錄，不會再只顯示空白畫面。</p><p class="error">${safeMessage}</p><p class="url">${safeUrl}</p><button id="retry">重新載入</button></main></body></html>`;
  try {
    await window.webContents.executeJavaScript(`document.open();document.write(${JSON.stringify(html)});document.close();document.getElementById("retry").addEventListener("click",()=>{location.href=${JSON.stringify(originalUrl)}});`);
  } catch (error) {
    appendStartupLog("failed to render desktop diagnostic:", error?.message || String(error));
  }
}

const originalLoadURL = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = function patchedLoadURL(url, options) {
  const window = this;
  const isDesktopProxy = typeof url === "string" && /^http:\/\/localhost:\d+\//.test(url);
  if (!isDesktopProxy) return originalLoadURL.call(window, url, options);

  const proxyOrigin = new URL(url).origin;
  const serverOrigin = configuredServerOrigin();
  const contents = window.webContents;

  // Next.js/NextAuth can occasionally emit an absolute redirect to the company
  // Host. Keep that navigation inside the signed localhost proxy instead of
  // blocking it and leaving the BrowserWindow on its blank background.
  contents.removeAllListeners("will-navigate");
  contents.on("will-navigate", (event, nextUrl) => {
    if (nextUrl.startsWith(proxyOrigin)) return;
    try {
      const parsed = new URL(nextUrl);
      if (serverOrigin && parsed.origin === serverOrigin) {
        event.preventDefault();
        const proxiedUrl = `${proxyOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        void originalLoadURL.call(window, proxiedUrl).catch((error) => showLoadFailure(window, proxiedUrl, error?.message || String(error)));
        return;
      }
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        event.preventDefault();
        void shell.openExternal(nextUrl);
        return;
      }
    } catch {}
    event.preventDefault();
  });

  const onFailure = (_event, code, description, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return;
    void showLoadFailure(window, url, `${description || "頁面載入失敗"} (${code}) ${validatedUrl || ""}`);
  };
  contents.once("did-fail-load", onFailure);
  contents.once("render-process-gone", (_event, details) => {
    void showLoadFailure(window, url, `顯示程序已停止：${details?.reason || "unknown"}`);
  });

  const loading = originalLoadURL.call(window, url, {
    ...options,
    extraHeaders: `${options?.extraHeaders || ""}Cache-Control: no-cache\r\nPragma: no-cache\r\n`,
  }).catch(async (error) => {
    await showLoadFailure(window, url, error?.message || String(error));
  });

  void loading.then(() => {
    setTimeout(async () => {
      if (window.isDestroyed()) return;
      try {
        const state = await contents.executeJavaScript(`({ready:document.readyState,text:(document.body?.innerText||"").trim().length,html:document.documentElement?.innerHTML?.length||0})`);
        if (state?.ready === "complete" && Number(state?.text || 0) === 0) {
          await showLoadFailure(window, url, "網頁已完成載入，但登入畫面與前端資源沒有顯示");
        }
      } catch (error) {
        appendStartupLog("blank-page watchdog failed:", error?.message || String(error));
      }
    }, 12_000);
  });

  return loading;
};

appendStartupLog("desktop bootstrap enabled");
require("./main.cjs");
