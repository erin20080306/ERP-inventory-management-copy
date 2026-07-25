import { normalizeRootDomain, tenantSubdomainLabel } from "./tenant-subdomain";

const DEFAULT_PUBLIC_STOREFRONT_ORIGIN = "https://erp-inventory-management-copy.vercel.app";

export function publicStorefrontOrigin() {
  const serverOrigin = typeof window === "undefined"
    ? process.env.PUBLIC_STOREFRONT_ORIGIN
    : undefined;
  return String(
    serverOrigin
      || process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN
      || DEFAULT_PUBLIC_STOREFRONT_ORIGIN,
  ).replace(/\/$/, "");
}

export function publicStorefrontRootDomain() {
  const serverRootDomain = typeof window === "undefined"
    ? process.env.PUBLIC_STOREFRONT_ROOT_DOMAIN
    : undefined;
  return normalizeRootDomain(
    serverRootDomain
      || process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN,
  );
}

export function storefrontPath(slug: string) {
  return `/store/${encodeURIComponent(slug)}`;
}

export function medicalSitePath(slug: string) {
  return `/medical/${encodeURIComponent(slug)}`;
}

function tenantSubdomainUrl(slug: string) {
  const label = tenantSubdomainLabel(slug);
  const rootDomain = publicStorefrontRootDomain();
  return label && rootDomain ? `https://${label}.${rootDomain}` : null;
}

export function storefrontUrl(slug: string) {
  return tenantSubdomainUrl(slug)
    || `${publicStorefrontOrigin()}${storefrontPath(slug)}`;
}

export function medicalSiteUrl(slug: string) {
  return tenantSubdomainUrl(slug)
    || `${publicStorefrontOrigin()}${medicalSitePath(slug)}`;
}
