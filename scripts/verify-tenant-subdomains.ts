import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  medicalSiteUrl,
  publicStorefrontRootDomain,
  storefrontUrl,
} from "../src/lib/public-site-links";
import {
  normalizeRootDomain,
  tenantSiteRewritePath,
  tenantSubdomainFromHost,
  tenantSubdomainLabel,
} from "../src/lib/tenant-subdomain";

const originalPublicRoot = process.env.PUBLIC_STOREFRONT_ROOT_DOMAIN;
const originalNextPublicRoot = process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN;

try {
  delete process.env.PUBLIC_STOREFRONT_ROOT_DOMAIN;
  delete process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN;

  assert.equal(publicStorefrontRootDomain(), "erin-com.com");
  assert.equal(storefrontUrl("legacy-store"), "https://legacy-store.erin-com.com");
  assert.equal(storefrontUrl("www"), "https://www.erin-com.com/store/www");

  process.env.PUBLIC_STOREFRONT_ROOT_DOMAIN = "https://www.erin-com.com/";
  delete process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN;

  assert.equal(normalizeRootDomain("https://www.erin-com.com/"), "erin-com.com");
  assert.equal(publicStorefrontRootDomain(), "erin-com.com");
  assert.equal(tenantSubdomainLabel("Fat-Duck"), "fat-duck");
  assert.equal(tenantSubdomainLabel("www"), null);
  assert.equal(tenantSubdomainLabel("erin-internal"), null);
  assert.equal(tenantSubdomainLabel("bad_slug"), null);

  assert.equal(storefrontUrl("fat-duck"), "https://fat-duck.erin-com.com");
  assert.equal(medicalSiteUrl("clinic-tw"), "https://clinic-tw.erin-com.com");
  assert.match(storefrontUrl("www"), /\/store\/www$/);
  assert.match(storefrontUrl("erin-internal"), /\/store\/erin-internal$/);
  assert.match(medicalSiteUrl("erin-internal"), /\/medical\/erin-internal$/);

  assert.equal(tenantSubdomainFromHost("fat-duck.erin-com.com", "erin-com.com"), "fat-duck");
  assert.equal(tenantSubdomainFromHost("fat-duck.erin-com.com:443", "https://www.erin-com.com"), "fat-duck");
  assert.equal(tenantSubdomainFromHost("www.erin-com.com", "erin-com.com"), null);
  assert.equal(tenantSubdomainFromHost("erin-com.com", "erin-com.com"), null);
  assert.equal(tenantSubdomainFromHost("nested.fat-duck.erin-com.com", "erin-com.com"), null);
  assert.equal(tenantSubdomainFromHost("fat-duck.example.com", "erin-com.com"), null);

  assert.equal(tenantSiteRewritePath("fat-duck", "/"), "/site/fat-duck");
  assert.equal(tenantSiteRewritePath("fat-duck", "/products"), "/site/fat-duck/products");
  assert.equal(tenantSiteRewritePath("bad_slug", "/products"), null);

  const middleware = readFileSync("src/middleware.ts", "utf8");
  const tenantSitePage = readFileSync("src/app/site/[tenant]/[[...view]]/page.tsx", "utf8");
  const publicLinks = readFileSync("src/lib/public-site-links.ts", "utf8");

  assert.match(middleware, /tenantSubdomainFromHost/);
  assert.match(middleware, /tenantSiteRewritePath/);
  assert.match(middleware, /cleanLegacyTenantPath/);
  assert.match(middleware, /NextResponse\.redirect\(redirectUrl, 308\)/);
  assert.match(middleware, /NextResponse\.rewrite/);
  assert.match(middleware, /isProtectedPath/);
  assert.match(middleware, /const TENANT_PUBLIC_PROTECTED_PREFIXES = \["\/products"\]/);
  assert.match(middleware, /tenantSlug && isTenantPublicProtectedPath\(pathname\)/);
  assert.doesNotMatch(middleware, /tenantSlug && !\/\\\.\[\^\/\]\+\$\/\.test\(pathname\)/);
  assert.match(tenantSitePage, /FashionStorefront/);
  assert.match(tenantSitePage, /MedicalClinicSite/);
  assert.match(tenantSitePage, /businessMode: \{ in: \["ECOMMERCE", "POS_MEDICAL"\] \}/);
  assert.match(publicLinks, /PUBLIC_STOREFRONT_ROOT_DOMAIN/);
  assert.match(publicLinks, /NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN/);
} finally {
  if (originalPublicRoot === undefined) delete process.env.PUBLIC_STOREFRONT_ROOT_DOMAIN;
  else process.env.PUBLIC_STOREFRONT_ROOT_DOMAIN = originalPublicRoot;
  if (originalNextPublicRoot === undefined) delete process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN;
  else process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN = originalNextPublicRoot;
}

console.log("Tenant wildcard subdomain routing and protected-path whitelist: PASS");
