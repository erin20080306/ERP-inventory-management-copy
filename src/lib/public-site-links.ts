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

export function storefrontPath(slug: string) {
  return `/store/${encodeURIComponent(slug)}`;
}

export function medicalSitePath(slug: string) {
  return `/medical/${encodeURIComponent(slug)}`;
}

export function storefrontUrl(slug: string) {
  return `${publicStorefrontOrigin()}${storefrontPath(slug)}`;
}

export function medicalSiteUrl(slug: string) {
  return `${publicStorefrontOrigin()}${medicalSitePath(slug)}`;
}
