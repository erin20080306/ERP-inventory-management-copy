import { ApiError } from "./api";

const DEFAULT_STOREFRONT_ORIGIN = "https://erp-inventory-management-copy.vercel.app";
const RESERVED_STORE_SLUGS = new Set(["atelier-noir", "moon-form"]);

export function normalizeStoreSlug(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function assertStoreSlug(value: unknown) {
  const slug = normalizeStoreSlug(value);
  if (!/^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/.test(slug)) {
    throw new ApiError(400, "商城網址代碼需為 4–50 個小寫英文字母、數字或連字號，開頭與結尾不可為連字號");
  }
  if (RESERVED_STORE_SLUGS.has(slug)) throw new ApiError(409, "此商城網址代碼為展示商店保留，請改用其他名稱");
  return slug;
}

export function publicStorefrontOrigin() {
  return String(
    process.env.PUBLIC_STOREFRONT_ORIGIN
      || process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN
      || DEFAULT_STOREFRONT_ORIGIN,
  ).replace(/\/$/, "");
}

export function storefrontUrl(slug: string) {
  return `${publicStorefrontOrigin()}/store/${encodeURIComponent(slug)}`;
}
