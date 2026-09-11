// 系統支援的語言。新增語言時同步新增 messages/<locale>.json。
export const LOCALES = ["zh-TW", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh-TW";

/** 語言偏好 Cookie；由中介層依使用者設定同步，前台切換器也會寫入。 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** 中介層解析對外網站語言後，改寫請求時帶上的標頭。 */
export const LOCALE_HEADER = "x-erp-locale";

/** 語言選單顯示名稱，一律以該語言本身書寫。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-TW": "繁體中文",
  en: "English",
};

/** HTML lang 與 Intl API 使用的 BCP 47 標籤。 */
export const LOCALE_BCP47: Record<Locale, string> = {
  "zh-TW": "zh-Hant-TW",
  en: "en-US",
};

/** 各語言的預設顯示幣別，供金額格式化在未指定幣別時使用。 */
export const LOCALE_DEFAULT_CURRENCY: Record<Locale, string> = {
  "zh-TW": "TWD",
  en: "USD",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** 把任意輸入正規化成支援的語言；無法判斷時回傳預設語言。 */
export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_LOCALE;
  if (raw.startsWith("zh")) return "zh-TW";
  if (raw.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

/**
 * 由 Accept-Language 標頭挑出最合適的語言。
 * 只在使用者尚未做過任何選擇時作為後備，不覆寫已儲存的偏好。
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of candidates) {
    if (tag.startsWith("zh")) return "zh-TW";
    if (tag.startsWith("en")) return "en";
  }
  return null;
}
