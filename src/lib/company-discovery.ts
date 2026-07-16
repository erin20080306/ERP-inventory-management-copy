import { X509Certificate } from "node:crypto";

export function normalizeDiscoveryServerUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("公司主機網址格式錯誤");
  }
  if (url.protocol !== "https:") throw new Error("公司主機必須使用 https:// 加密網址");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("公司主機網址只能包含 https://主機:連接埠");
  }
  return url.origin;
}

export function validateDiscoveryCaCertificate(value: string) {
  if (!value.includes("BEGIN CERTIFICATE")) throw new Error("CA 憑證格式錯誤");
  try {
    const certificate = new X509Certificate(value);
    if (!certificate.ca) throw new Error("not a CA certificate");
  } catch {
    throw new Error("CA 憑證無法解析或不是根憑證");
  }
  return `${value.trim()}\n`;
}
