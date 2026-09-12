import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { tenantSiteRewritePath, tenantSubdomainFromHost } from "@/lib/tenant-subdomain";
import { isIosAppRequest, isIosRestrictedMedicalPath } from "@/lib/client-platform";
import { LOCALE_COOKIE, LOCALE_HEADER, isLocale, type Locale } from "@/i18n/config";
import { splitLocalePath } from "@/i18n/routing";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/workspace",
  "/pos",
  "/products",
  "/customers",
  "/suppliers",
  "/purchases",
  "/sales",
  "/quotations",
  "/inventory",
  "/warehouses",
  "/returns",
  "/accounting",
  "/reports",
  "/users",
  "/roles",
  "/settings",
  "/audit",
  "/print",
  "/admin",
  "/downloads",
];

// 商城商品頁沿用既有公開操作；其餘受保護路徑即使位於租戶子網域仍需登入。
const TENANT_PUBLIC_PROTECTED_PREFIXES = ["/products"];
const IOS_UNAVAILABLE_MESSAGE = "此功能目前不在 iOS App 提供，請使用完整網頁版或桌面版。";
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

function isTenantPublicProtectedPath(pathname: string) {
  return TENANT_PUBLIC_PROTECTED_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

function configuredRootDomain() {
  return process.env.PUBLIC_STOREFRONT_ROOT_DOMAIN
    || process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN
    || "";
}

function requestTenantSlug(request: { headers: Headers }) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  return tenantSubdomainFromHost(host, configuredRootDomain());
}

function cleanLegacyTenantPath(pathname: string, tenantSlug: string) {
  const encodedSlug = encodeURIComponent(tenantSlug);
  for (const prefix of [`/store/${encodedSlug}`, `/medical/${encodedSlug}`]) {
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
    const remainder = pathname.slice(prefix.length);
    return remainder || "/";
  }
  return null;
}

/** 取出對外網址的語言前綴；後台路徑一律拿不到前綴，網址維持原樣。 */
function readPathLocale(pathname: string) {
  return splitLocalePath(pathname);
}

/**
 * 把資料庫中的使用者語言同步到 Cookie。
 * Server Component 與 next-intl 只讀 Cookie，避免每次請求都查 User 資料表。
 */
function syncLocaleCookie(
  response: NextResponse,
  currentCookie: string | undefined,
  desired: Locale | null,
) {
  if (!desired || currentCookie === desired) return response;
  response.cookies.set({
    name: LOCALE_COOKIE,
    value: desired,
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export default withAuth(
  function middleware(request) {
    const localeMatch = readPathLocale(request.nextUrl.pathname);
    // 後續所有判斷都以「去掉語言前綴」的路徑進行，既有規則不受影響。
    const pathname = localeMatch?.pathname ?? request.nextUrl.pathname;
    const pathLocale = localeMatch?.locale ?? null;

    const token = (request as unknown as { nextauth?: { token?: { locale?: unknown } } }).nextauth?.token;
    const userLocale = isLocale(token?.locale) ? token.locale : null;
    const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;

    // 網址語言優先於使用者設定；讓 /en/store 分享出去一定是英文。
    const requestHeaders = new Headers(request.headers);
    if (pathLocale) requestHeaders.set(LOCALE_HEADER, pathLocale);
    else requestHeaders.delete(LOCALE_HEADER);
    const forward = { request: { headers: requestHeaders } };

    const finish = (response: NextResponse) => syncLocaleCookie(response, cookieLocale, userLocale);

    /** 沒有其他改寫需求時的預設回應：有語言前綴就改寫成實際路徑。 */
    const passThrough = () => {
      if (!localeMatch) return finish(NextResponse.next(forward));
      const stripped = request.nextUrl.clone();
      stripped.pathname = pathname;
      return finish(NextResponse.rewrite(stripped, forward));
    };

    if (pathname === "/login" && isIosAppRequest(request.headers)) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/login/ios";
      return finish(NextResponse.rewrite(destination, forward));
    }

    if (isIosAppRequest(request.headers) && isIosRestrictedMedicalPath(pathname)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: IOS_UNAVAILABLE_MESSAGE }, { status: 403 });
      }
      const destination = request.nextUrl.clone();
      destination.pathname = pathname === "/medical" ? "/workspace" : "/solutions";
      destination.search = "";
      return NextResponse.redirect(destination);
    }

    if (pathname.startsWith("/site/") || /\.[^/]+$/.test(pathname)) {
      return passThrough();
    }

    const tenantSlug = requestTenantSlug(request);
    if (tenantSlug) {
      const cleanPath = cleanLegacyTenantPath(pathname, tenantSlug);
      if (cleanPath) {
        const redirectUrl = request.nextUrl.clone();
        // 保留語言前綴，避免英文訪客被導回中文網址。
        redirectUrl.pathname = pathLocale ? `/${pathLocale}${cleanPath === "/" ? "" : cleanPath}` : cleanPath;
        return NextResponse.redirect(redirectUrl, 308);
      }

      const rewritePath = tenantSiteRewritePath(tenantSlug, pathname);
      if (rewritePath) {
        const url = request.nextUrl.clone();
        url.pathname = rewritePath;
        return finish(NextResponse.rewrite(url, forward));
      }
    }

    return passThrough();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // 權限判斷同樣忽略語言前綴，公開頁不會因為 /en 而被誤判成受保護路徑。
        const pathname = readPathLocale(req.nextUrl.pathname)?.pathname ?? req.nextUrl.pathname;
        if (!isProtectedPath(pathname)) return true;
        const tenantSlug = requestTenantSlug(req);
        if (tenantSlug && isTenantPublicProtectedPath(pathname)) return true;
        return Boolean(token) && !token?.revoked;
      },
    },
  },
);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js).*)",
    "/api/medical/:path*",
    "/api/medical-site/:path*",
  ],
};
