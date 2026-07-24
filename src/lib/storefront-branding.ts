import { ApiError } from "./api";

const RESERVED_STORE_SLUGS = new Set(["atelier-noir", "moon-form", "atelier-clinic"]);

export { medicalSiteUrl, publicStorefrontOrigin, storefrontUrl } from "./public-site-links";

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
    throw new ApiError(400, "網站網址代碼需為 4–50 個小寫英文字母、數字或連字號，開頭與結尾不可為連字號");
  }
  if (RESERVED_STORE_SLUGS.has(slug)) throw new ApiError(409, "此網站網址代碼為展示網站保留，請改用其他名稱");
  return slug;
}
