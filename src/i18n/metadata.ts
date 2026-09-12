import type { Metadata } from "next";
import { LOCALES, DEFAULT_LOCALE, LOCALE_BCP47, normalizeLocale, type Locale } from "./config";
import { localizePublicPath, isPublicLocalePath } from "./routing";

/**
 * 為對外公開頁面產生 canonical 與 hreflang 替代連結。
 * 後台頁面不需要（也不應該）出現在搜尋結果，因此非公開路徑直接回傳空物件。
 *
 * canonical 指向「目前語言」的網址，x-default 指向預設語言，
 * 符合 Google 對多語言網站的建議，避免各語言版本互相稀釋排名。
 *
 * @param pathname 不含語言前綴的路徑，例如 /store/acme/products
 * @param locale   目前請求的語言（通常由 next-intl 的 getLocale() 取得）
 */
export function localeAlternates(pathname: string, locale: Locale | string = DEFAULT_LOCALE): Pick<Metadata, "alternates"> {
  if (!isPublicLocalePath(pathname)) return {};
  const current = normalizeLocale(locale);
  const languages: Record<string, string> = {};
  for (const candidate of LOCALES) {
    languages[LOCALE_BCP47[candidate]] = localizePublicPath(pathname, candidate);
  }
  languages["x-default"] = localizePublicPath(pathname, DEFAULT_LOCALE);
  return {
    alternates: {
      canonical: localizePublicPath(pathname, current),
      languages,
    },
  };
}
