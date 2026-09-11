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

console.log(`✅ i18n 驗證通過：${Object.keys(zh).length} 個翻譯鍵、${LOCALES.length} 種語言、${STANDARD_ACCOUNTS.length} 個標準科目`);
