import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 把原始碼裡的翻譯呼叫（t("key")、f("key")、tc("key", { … }) …）
 * 就地換成 zh-TW 字典的中文值，讓「檢查畫面是否出現某段中文」的煙霧測試
 * 在字串搬進字典後仍然有效，不必再對硬編碼中文字面值做斷言。
 *
 * 解析採「全域鍵」策略：不依賴 alias 對應的命名空間（元件可能用 useTranslations、
 * getTranslations，甚至 Promise.all 解構取得翻譯函式），而是直接拿呼叫參數
 * 去整份字典找唯一對應值。鍵在專案內大多唯一；若同名鍵對到多個不同值則保守略過。
 */

const DICT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "messages", "zh-TW.json");

function flatten(node, prefix, out) {
  if (typeof node === "string") {
    out[prefix] = node;
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
}

let suffixIndex = null;

function buildIndex() {
  if (suffixIndex) return suffixIndex;
  const flat = {};
  flatten(JSON.parse(readFileSync(DICT_PATH, "utf8")), "", flat);
  const index = new Map();
  for (const [fullPath, value] of Object.entries(flat)) {
    const segments = fullPath.split(".");
    // 建立所有「後綴路徑」，讓 t("todayWebRevenue") 與 t("pages.products.title") 都查得到
    for (let i = 0; i < segments.length; i++) {
      const suffix = segments.slice(i).join(".");
      if (!index.has(suffix)) index.set(suffix, new Set());
      index.get(suffix).add(value);
    }
  }
  suffixIndex = index;
  return index;
}

/** 依呼叫參數（鍵）查唯一中文值；查不到或有歧義回傳 null。 */
export function lookupZh(key) {
  const values = buildIndex().get(key);
  if (!values || values.size !== 1) return null;
  return [...values][0];
}

/** 從 zh-TW 字典依「命名空間 + 鍵」取值。 */
function lookupNs(ns, key) {
  return lookupExact(`${ns}.${key}`);
}

function lookupExact(fullPath) {
  const values = buildIndex().get(fullPath);
  if (!values || values.size !== 1) return null;
  return [...values][0];
}

/**
 * 把原始碼中的翻譯呼叫換成中文值後回傳。
 * 先用 alias 對應的命名空間解析（正確處理同名鍵在不同命名空間的情況），
 * 再退回全域唯一鍵查找（處理以 Promise.all 解構等方式取得的翻譯函式）。
 */
export function renderZh(source) {
  const aliasNs = new Map();
  for (const m of source.matchAll(
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g,
  )) {
    aliasNs.set(m[1], m[2]);
  }
  return source.replace(
    /\b(\w+)\(\s*"([A-Za-z0-9_.]+)"(?:\s*,\s*\{[^}]*\})?\)/g,
    (match, alias, key) => {
      const ns = aliasNs.get(alias);
      const viaAlias = ns ? lookupNs(ns, key) : null;
      return viaAlias ?? lookupZh(key) ?? match;
    },
  );
}

/** 讀檔並直接回傳「已還原成中文」的內容，供測試腳本比對。 */
export function readRenderedZh(relativePath) {
  return renderZh(readFileSync(relativePath, "utf8"));
}
