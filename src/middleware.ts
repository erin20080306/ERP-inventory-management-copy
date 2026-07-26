import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { tenantSiteRewritePath, tenantSubdomainFromHost } from "@/lib/tenant-subdomain";

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

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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

export default withAuth(
  function middleware(request) {
    const pathname = request.nextUrl.pathname;
    if (pathname.startsWith("/site/") || /\.[^/]+$/.test(pathname)) {
      return NextResponse.next();
    }

    const tenantSlug = requestTenantSlug(request);
    if (tenantSlug) {
      const cleanPath = cleanLegacyTenantPath(pathname, tenantSlug);
      if (cleanPath) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = cleanPath;
        return NextResponse.redirect(redirectUrl, 308);
      }

      const rewritePath = tenantSiteRewritePath(tenantSlug, pathname);
      if (rewritePath) {
        const url = request.nextUrl.clone();
        url.pathname = rewritePath;
        return NextResponse.rewrite(url);
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        if (!isProtectedPath(pathname)) return true;
        const tenantSlug = requestTenantSlug(req);
        if (tenantSlug && !/\.[^/]+$/.test(pathname)) return true;
        return Boolean(token) && !token?.revoked;
      },
    },
  },
);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js).*)",
  ],
};
