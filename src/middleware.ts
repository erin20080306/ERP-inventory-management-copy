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

export default withAuth(
  function middleware(request) {
    const pathname = request.nextUrl.pathname;
    if (pathname.startsWith("/site/") || /\.[^/]+$/.test(pathname)) {
      return NextResponse.next();
    }

    const tenantSlug = requestTenantSlug(request);
    const rewritePath = tenantSlug ? tenantSiteRewritePath(tenantSlug, pathname) : null;
    if (rewritePath) {
      const url = request.nextUrl.clone();
      url.pathname = rewritePath;
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => Boolean(requestTenantSlug(req)) || !isProtectedPath(req.nextUrl.pathname) || Boolean(token),
    },
  },
);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js).*)",
  ],
};
