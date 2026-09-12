import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_LOCALE,
  LOCALES,
  localeFromAcceptLanguage,
  normalizeLocale,
} from "../src/i18n/config";
import {
  alternateLocalePaths,
  isPublicLocalePath,
  localizePublicPath,
  splitLocalePath,
} from "../src/i18n/routing";
import { createFormatters, currencyFractionDigits } from "../src/i18n/format";
import { ACCOUNT_NAME_EN, accountDisplayName } from "../src/lib/account-names-en";
import { STANDARD_ACCOUNTS } from "../prisma/standard-accounts";
import { renderZh } from "./i18n-source-render.mjs";

const root = path.resolve(__dirname, "..");

function flatten(value: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    const full = `${prefix}${key}`;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      Object.assign(out, flatten(entry as Record<string, unknown>, `${full}.`));
    } else {
      out[full] = String(entry);
    }
  }
  return out;
}

function loadMessages(locale: string) {
  return flatten(JSON.parse(readFileSync(path.join(root, "messages", `${locale}.json`), "utf8")));
}

// === 1. 字典完整性 ===
const zh = loadMessages("zh-TW");
const en = loadMessages("en");

const missingInEn = Object.keys(zh).filter((key) => !(key in en));
const missingInZh = Object.keys(en).filter((key) => !(key in zh));
assert.deepEqual(missingInEn, [], `英文字典缺少鍵：${missingInEn.join(", ")}`);
assert.deepEqual(missingInZh, [], `中文字典缺少鍵：${missingInZh.join(", ")}`);

const blank = Object.entries(en).filter(([, value]) => !value.trim()).map(([key]) => key);
assert.deepEqual(blank, [], `英文字典有空值：${blank.join(", ")}`);

// 英文值不得殘留中文，否則等於沒翻譯。
const untranslated = Object.keys(en).filter((key) => /[一-鿿]/.test(en[key]));
assert.deepEqual(untranslated, [], `英文字典仍是中文：${untranslated.join(", ")}`);

// ICU 參數必須兩邊一致，否則切換語言時會少帶變數。
const placeholder = /\{(\w+)[^}]*\}/g;
for (const key of Object.keys(zh)) {
  const zhVars = new Set([...zh[key].matchAll(placeholder)].map((match) => match[1]));
  const enVars = new Set([...en[key].matchAll(placeholder)].map((match) => match[1]));
  assert.deepEqual(
    [...zhVars].sort(),
    [...enVars].sort(),
    `「${key}」的 ICU 參數不一致：zh=${[...zhVars]} en=${[...enVars]}`,
  );
}

// === 2. 程式用到的翻譯鍵都存在 ===
function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

const unresolved: string[] = [];
for (const file of walk(path.join(root, "src"))) {
  const source = readFileSync(file, "utf8");
  // 解析出「變數名 → 命名空間」，因此 const f = useTranslations("fields") 之後
  // 的 f("code") 也會被檢查，不是只認 t(...)。
  const byVariable = new Map<string, string[]>();
  for (const match of source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\("([^"]+)"\)/g)) {
    const [, variable, namespace] = match;
    byVariable.set(variable, [...(byVariable.get(variable) ?? []), namespace]);
  }
  if (byVariable.size === 0) continue;

  for (const [variable, namespaces] of byVariable) {
    const calls = source.matchAll(new RegExp(`\\b${variable}\\("([A-Za-z0-9_.]+)"`, "g"));
    for (const call of calls) {
      const key = call[1];
      if (!namespaces.some((ns) => `${ns}.${key}` in zh)) {
        unresolved.push(`${path.relative(root, file)} → ${variable}("${key}") 不在 ${namespaces.join(" / ")}`);
      }
    }
  }
}
assert.deepEqual(unresolved, [], `找不到對應翻譯的鍵：\n${unresolved.join("\n")}`);

// === 2b. 匯入欄位名不得走翻譯 ===
// Excel／CSV 匯入的欄位名是既有客戶檔案的格式契約。
// 若被翻成英文，英文模式產生的範本就會對不到 importMap 讀取的鍵，匯入直接失效。
const translatedImportKeys: string[] = [];
for (const file of walk(path.join(root, "src"))) {
  const source = readFileSync(file, "utf8");
  const relative = path.relative(root, file);

  // r[t("...")] 這種讀取匯入欄位的寫法一律不允許
  for (const match of source.matchAll(/\br\[\s*\w+\(\s*"/g)) {
    const line = source.slice(0, match.index).split("\n").length;
    translatedImportKeys.push(`${relative}:${line} 匯入欄位名用了翻譯函式`);
  }

  // 物件字面值的「鍵」若走翻譯，通常是 CSV 值對照表（中文 → 代碼），同樣不可翻譯
  for (const match of source.matchAll(/[{,]\s*\w+\(\s*"[A-Za-z0-9_]+"\s*\)\s*:/g)) {
    const line = source.slice(0, match.index).split("\n").length;
    translatedImportKeys.push(`${relative}:${line} 物件鍵用了翻譯函式（多半是匯入對照表）`);
  }

  // templateHeaders 陣列裡也不可以出現翻譯呼叫
  for (const match of source.matchAll(/templateHeaders=\{\[([^\]]*)\]/g)) {
    if (!/\w+\(\s*"/.test(match[1])) continue;
    const line = source.slice(0, match.index).split("\n").length;
    translatedImportKeys.push(`${relative}:${line} templateHeaders 用了翻譯函式`);
  }
}
assert.deepEqual(
  translatedImportKeys,
  [],
  `匯入欄位名必須是中文字面值，不可翻譯：\n${translatedImportKeys.join("\n")}`,
);

// === 3. 語言判斷 ===
assert.equal(normalizeLocale("en-GB"), "en");
assert.equal(normalizeLocale("zh-Hant"), "zh-TW");
assert.equal(normalizeLocale("fr"), DEFAULT_LOCALE);
assert.equal(normalizeLocale(undefined), DEFAULT_LOCALE);
assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9,zh-TW;q=0.8"), "en");
assert.equal(localeFromAcceptLanguage("zh-TW,zh;q=0.9"), "zh-TW");
assert.equal(localeFromAcceptLanguage("de-DE"), null);
assert.equal(localeFromAcceptLanguage(null), null);
// q 值較高者優先，不能只看排列順序。
assert.equal(localeFromAcceptLanguage("zh-TW;q=0.2,en;q=0.9"), "en");

// === 4. 公開網址語言前綴；後台網址必須維持不變 ===
assert.equal(isPublicLocalePath("/store/acme"), true);
assert.equal(isPublicLocalePath("/site/acme/about"), true);
assert.equal(isPublicLocalePath("/medical/acme"), true);
assert.equal(isPublicLocalePath("/"), true);
assert.equal(isPublicLocalePath("/plans"), true);
// 後台：POS、銷售、儀表板、醫美櫃台都不得被加上語言前綴。
for (const backend of ["/pos", "/pos/restaurant", "/sales", "/dashboard", "/medical", "/admin", "/settings"]) {
  assert.equal(isPublicLocalePath(backend), false, `${backend} 不應視為公開多語路徑`);
  assert.equal(localizePublicPath(backend, "en"), backend, `${backend} 不應被加上語言前綴`);
}

assert.deepEqual(splitLocalePath("/en/store/acme/products"), { locale: "en", pathname: "/store/acme/products" });
assert.deepEqual(splitLocalePath("/zh-TW/store/acme"), { locale: "zh-TW", pathname: "/store/acme" });
assert.deepEqual(splitLocalePath("/en"), { locale: "en", pathname: "/" });
// 後台路徑即使被塞語言前綴也不解析，避免 /en/pos 意外繞過既有規則。
assert.equal(splitLocalePath("/en/pos"), null);
assert.equal(splitLocalePath("/store/acme"), null);
assert.equal(splitLocalePath("/fr/store/acme"), null);

assert.equal(localizePublicPath("/store/acme", "zh-TW"), "/store/acme");
assert.equal(localizePublicPath("/store/acme", "en"), "/en/store/acme");
assert.equal(localizePublicPath("/", "en"), "/en");
assert.deepEqual(alternateLocalePaths("/store/acme"), { "zh-TW": "/store/acme", en: "/en/store/acme" });

// 來回轉換必須可還原。
for (const locale of LOCALES) {
  const localized = localizePublicPath("/store/acme/products", locale);
  const parsed = splitLocalePath(localized);
  assert.equal(parsed ? parsed.pathname : localized, "/store/acme/products");
}

// === 5. 金額與日期格式：幣別不隨語言改變 ===
assert.equal(currencyFractionDigits("TWD"), 0);
assert.equal(currencyFractionDigits("USD"), 2);

const zhFormat = createFormatters("zh-TW", "TWD");
const enFormat = createFormatters("en", "TWD");
// 同一筆 TWD 金額，兩種語言的數值相同（只有呈現方式可能不同）。
for (const amount of [0, 1234, 98765]) {
  const digits = (value: string) => value.replace(/[^\d]/g, "");
  assert.equal(digits(zhFormat.money(amount)), digits(enFormat.money(amount)), "TWD 金額數值不應隨語言改變");
}
// 英文介面若單據幣別是 USD，仍須顯示 USD，不可被語言覆蓋成 TWD。
assert.match(enFormat.money(1234.5, "USD"), /1,234\.50/);
assert.match(zhFormat.money(1234.5, "USD"), /1,234\.50/);
// TWD 進位到元，維持既有帳務規則。
assert.equal(enFormat.money(1234.6, "TWD").includes("."), false);
// 無效幣別不得讓報表崩潰。
assert.match(createFormatters("en", "ZZZZ").money(10), /ZZZZ/);
assert.equal(enFormat.date(null), "—");
assert.equal(enFormat.dateTime(""), "—");
assert.notEqual(enFormat.date("2026-03-05T00:00:00Z"), "—");

// === 6. 會計科目英文對照 ===
const missingEnglish = STANDARD_ACCOUNTS.filter((account) => !ACCOUNT_NAME_EN[account.code]).map((a) => a.code);
assert.deepEqual(missingEnglish, [], `標準科目缺英文名稱：${missingEnglish.join(", ")}`);
// 中文介面永遠顯示資料庫原名；自訂科目即使在英文介面也不得被翻譯。
assert.equal(accountDisplayName("zh-TW", "1101", "庫存現金"), "庫存現金");
assert.equal(accountDisplayName("en", "1101", "庫存現金"), "Cash on Hand");
assert.equal(accountDisplayName("en", "9999", "自訂科目"), "自訂科目");
assert.equal(accountDisplayName("en", null, "自訂科目"), "自訂科目");

// === 7. 驗證腳本不得對「已翻譯的畫面原始碼」做失效的中文斷言 ===
// 這類回歸只會在合併後的 release-desktop workflow（跑 test:pos 等整合測試）浮現，
// ci.yml 不跑那些步驟。這裡在 PR 階段就攔下：任何 assert.match(檔案內容, /中文/)
// 若在原始碼與「翻譯還原後」都找不到該中文，代表字串已搬進字典但斷言沒跟上。
const sourceAssertionProblems: string[] = [];
const rawSourceCache = new Map<string, string>();
const renderedSourceCache = new Map<string, string>();
function loadSource(relative: string): { raw: string; rendered: string } | null {
  const full = path.join(root, relative);
  if (!rawSourceCache.has(relative)) {
    try {
      const raw = readFileSync(full, "utf8");
      rawSourceCache.set(relative, raw);
      renderedSourceCache.set(relative, renderZh(raw));
    } catch {
      rawSourceCache.set(relative, "");
      renderedSourceCache.set(relative, "");
    }
  }
  const raw = rawSourceCache.get(relative)!;
  if (!raw) return null;
  return { raw, rendered: renderedSourceCache.get(relative)! };
}
// 同時掃描 .ts（assert.match(來源, /中文/)）與 .mjs（來源.includes("中文")）兩種斷言風格
for (const file of readdirSync(path.join(root, "scripts")).filter((f) => /^verify-.*\.(ts|mjs)$/.test(f))) {
  if (file === "verify-i18n.ts") continue;
  const scriptText = readFileSync(path.join(root, "scripts", file), "utf8");
  // 記錄每個來源變數對應的檔案，以及它是否用 renderZh 包住（決定比對 raw 或 rendered）
  const varInfo = new Map<string, { file: string; wrapped: boolean }>();
  for (const match of scriptText.matchAll(/const (\w+)\s*=\s*(renderZh\()?readFileSync\("([^"]+)"/g)) {
    varInfo.set(match[1], { file: match[3], wrapped: Boolean(match[2]) });
  }
  // 只鎖定「i18n 造成」的回歸：字串已搬進字典（renderZh 後才出現），
  // 但斷言比對的來源沒跟著改成 renderZh。刻意不管「原始碼與字典都找不到」的情況，
  // 那多半是與 i18n 無關的既有陳舊斷言或正則誤判，不該讓本守則產生假陽性。
  const flag = (
    variable: string,
    matches: (text: string) => boolean,
    literalNeedle: string | null,
    index: number,
    label: string,
  ) => {
    const info = varInfo.get(variable);
    if (!info) return;
    const loaded = loadSource(info.file);
    if (!loaded) return;
    const haystack = info.wrapped ? loaded.rendered : loaded.raw;
    if (matches(haystack)) return;
    // 只有「字典還原後才出現」才算 i18n 回歸；用字面 needle 判斷（正則無字面時略過）
    if (literalNeedle === null || !loaded.rendered.includes(literalNeedle)) return;
    const line = scriptText.slice(0, index).split("\n").length;
    sourceAssertionProblems.push(
      `scripts/${file}:${line} ${label} 對 ${info.file} 會失敗（字串已搬進字典：請把該來源改成 renderZh(readFileSync(...))）`,
    );
  };
  // .ts 風格：assert.match(var, /中文/) —— 以真正的正則比對，避免把 [\s\S]* 等中繼字元當字面
  for (const match of scriptText.matchAll(/assert\.match\((\w+),\s*\/((?:[^/\\]|\\.)*[一-鿿](?:[^/\\]|\\.)*)\//g)) {
    const pattern = match[2];
    let re: RegExp;
    try { re = new RegExp(pattern); } catch { continue; }
    // 若正則不含中繼字元，取其還原字面當作「搬進字典」判斷依據；含中繼字元則設為 null（不追蹤）
    const literal = /^[^.*+?^${}()|[\]\\]*$/.test(pattern.replace(/\\(.)/g, "$1"))
      ? pattern.replace(/\\(.)/g, "$1")
      : null;
    flag(match[1], (text) => re.test(text), literal, match.index!, `斷言 /${pattern.slice(0, 40)}/`);
  }
  // .mjs 風格：var.includes("中文")，排除否定（!var.includes(...) 是「應不存在」的檢查）
  for (const match of scriptText.matchAll(/(!?)\s*(\w+)\.includes\("([^"]*[一-鿿][^"]*)"\)/g)) {
    if (match[1] === "!") continue;
    const needle = match[3];
    flag(match[2], (text) => text.includes(needle), needle, match.index!, `.includes("${needle.slice(0, 24)}")`);
  }
}
assert.deepEqual(
  sourceAssertionProblems,
  [],
  `驗證腳本有失效的中文原始碼斷言：\n${sourceAssertionProblems.join("\n")}`,
);

console.log(`✅ i18n 驗證通過：${Object.keys(zh).length} 個翻譯鍵、${LOCALES.length} 種語言、${STANDARD_ACCOUNTS.length} 個標準科目`);
