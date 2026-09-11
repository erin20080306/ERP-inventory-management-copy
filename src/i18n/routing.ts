import { DEFAULT_LOCALE, LOCALES, type Locale, isLocale } from "./config";

/**
 * 對外公開、需要被搜尋引擎分語言收錄的路徑前綴。
 * 後台（/pos、/sales、/dashboard…）刻意不帶語言前綴，
 * 以免既有連結、iOS App 與桌面版的硬編碼網址失效。
 */
const PUBLIC_LOCALE_PATH_PREFIXES = [
  "/site",
  "/store",
  "/medical",
  "/solutions",
  "/plans",
  "/privacy",
  "/terms",
  "/refund",
];

/** 可帶語言前綴、但必須完全相符的路徑（避免誤攔子路由）。 */
const PUBLIC_LOCALE_EXACT_PATHS = ["/"];

/**
 * `/medical` 本身是後台醫美櫃台，`/medical/<租戶>` 才是對外診所官網。
 * 只有帶租戶代碼的網址可以加語言前綴。
 */
function isPublicMedicalPath(pathname: string) {
  return /^\/medical\/[^/]+/.test(pathname);
}

export function isPublicLocalePath(pathname: string) {
  if (PUBLIC_LOCALE_EXACT_PATHS.includes(pathname)) return true;
  if (pathname === "/medical" || pathname.startsWith("/medical/")) return isPublicMedicalPath(pathname);
  return PUBLIC_LOCALE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export type LocalePathMatch = { locale: Locale; pathname: string };

/**
 * 從網址取出語言前綴並回傳實際要渲染的路徑。
 * 例：/en/store/acme/products → { locale: "en", pathname: "/store/acme/products" }
 * 非公開路徑或預設語言前綴一律回傳 null，交給後續流程原樣處理。
 */
export function splitLocalePath(pathname: string): LocalePathMatch | null {
  const segments = pathname.split("/");
  const candidate = segments[1];
  if (!isLocale(candidate)) return null;

  const rest = `/${segments.slice(2).join("/")}`.replace(/\/{2,}/g, "/");
  const target = rest === "/" ? "/" : rest.replace(/\/$/, "");
  if (!isPublicLocalePath(target)) return null;

  return { locale: candidate, pathname: target };
}

/** 產生帶語言前綴的公開網址；預設語言不加前綴，維持既有網址不變。 */
export function localizePublicPath(pathname: string, locale: Locale) {
  if (locale === DEFAULT_LOCALE) return pathname;
  if (!isPublicLocalePath(pathname)) return pathname;
  return `/${locale}${pathname === "/" ? "" : pathname}`;
}

/** 供公開頁面輸出 hreflang 替代連結。 */
export function alternateLocalePaths(pathname: string) {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, localizePublicPath(pathname, locale)]),
  ) as Record<Locale, string>;
}
