import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  localeFromAcceptLanguage,
  normalizeLocale,
  type Locale,
  isLocale,
} from "./config";

/**
 * 決定本次請求要使用的語言，優先序由高到低：
 *  1. 中介層解析公開網址語言前綴後寫入的標頭（/en/store/... 一定是英文）
 *  2. NEXT_LOCALE Cookie —— 登入後由中介層依使用者資料庫設定同步
 *  3. 瀏覽器 Accept-Language（僅在使用者尚未做過任何選擇時）
 *  4. 系統預設語言
 *
 * 這裡刻意不查資料庫：每次請求都查 User 會拖慢所有 Server Component，
 * 資料庫仍是真正的來源，只是透過登入與切換語言時寫入 Cookie 快取。
 */
export async function resolveLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const fromPath = requestHeaders.get(LOCALE_HEADER);
  if (isLocale(fromPath)) return fromPath;

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const fromBrowser = localeFromAcceptLanguage(requestHeaders.get("accept-language"));
  if (fromBrowser) return fromBrowser;

  return DEFAULT_LOCALE;
}

export { normalizeLocale };
