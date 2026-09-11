import { LOCALE_BCP47, normalizeLocale, type Locale } from "./config";

/**
 * 金額格式化的分工：
 *  - 幣別是帳務事實，來自租戶設定（CompanySetting.currency），不隨介面語言改變。
 *  - 顯示方式（千分位、符號位置、小數位）才跟著使用者語言走。
 * 這與 SAP Business One／NetSuite 的作法一致：換語言不會把 TWD 帳變成 USD 帳。
 */

/** 無小數輔幣的幣別，沿用系統既有「TWD 一律進位到元」的規則。 */
const ZERO_DECIMAL_CURRENCIES = new Set(["TWD", "JPY", "KRW", "VND", "CLP", "ISK"]);

export function currencyFractionDigits(currency: string) {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

function intlTag(locale: Locale) {
  return LOCALE_BCP47[locale];
}

/** 依語言格式化金額；幣別由呼叫端（租戶設定或單據）決定。 */
export function formatMoneyIn(locale: Locale | string, amount: unknown, currency = "TWD") {
  const value = Number(amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  const digits = currencyFractionDigits(currency);
  try {
    return new Intl.NumberFormat(intlTag(normalizeLocale(locale)), {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(digits === 0 ? Math.round(safe) : safe);
  } catch {
    // 幣別代碼無效時不要讓報表崩潰，退回「代碼 + 數字」。
    return `${currency} ${formatNumberIn(locale, safe, digits)}`;
  }
}

/** 依語言格式化數量／筆數。 */
export function formatNumberIn(locale: Locale | string, value: unknown, fractionDigits = 0) {
  const parsed = Number(value ?? 0);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat(intlTag(normalizeLocale(locale)), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(safe);
}

/** 依語言格式化百分比，供毛利率與達成率使用。 */
export function formatPercentIn(locale: Locale | string, ratio: unknown, fractionDigits = 1) {
  const parsed = Number(ratio ?? 0);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat(intlTag(normalizeLocale(locale)), {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(safe);
}

function toDate(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 時區固定為營業所在地，不跟著介面語言換。
 * 英文使用者看到的仍是同一個營業日，避免跨時區把日結報表切錯天。
 */
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "Asia/Taipei";

export function formatDateIn(locale: Locale | string, value: Date | string | number | null | undefined) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(intlTag(normalizeLocale(locale)), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

export function formatDateTimeIn(locale: Locale | string, value: Date | string | number | null | undefined) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(intlTag(normalizeLocale(locale)), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: normalizeLocale(locale) === "en",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

export type LocaleFormatters = {
  locale: Locale;
  money: (amount: unknown, currency?: string) => string;
  number: (value: unknown, fractionDigits?: number) => string;
  percent: (ratio: unknown, fractionDigits?: number) => string;
  date: (value: Date | string | number | null | undefined) => string;
  dateTime: (value: Date | string | number | null | undefined) => string;
};

/** 綁定語言與租戶幣別，讓頁面直接呼叫 f.money(x) 就好。 */
export function createFormatters(locale: Locale | string, defaultCurrency = "TWD"): LocaleFormatters {
  const resolved = normalizeLocale(locale);
  return {
    locale: resolved,
    money: (amount, currency) => formatMoneyIn(resolved, amount, currency ?? defaultCurrency),
    number: (value, fractionDigits) => formatNumberIn(resolved, value, fractionDigits),
    percent: (ratio, fractionDigits) => formatPercentIn(resolved, ratio, fractionDigits),
    date: (value) => formatDateIn(resolved, value),
    dateTime: (value) => formatDateTimeIn(resolved, value),
  };
}
