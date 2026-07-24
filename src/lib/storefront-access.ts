import { normalizeBusinessMode, type BusinessMode } from "./product-editions";

export type StorefrontAccessUser = {
  tenantId?: string | null;
  companyCode?: string | null;
  permissions?: string[] | null;
  businessMode?: BusinessMode | string | null;
  isSuperAdmin?: boolean | null;
};

function normalizedTenantKey(value: string | null | undefined) {
  if (!value) return "";
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {}
  return decoded.trim().toUpperCase();
}

export function isTenantHighestPrivilege(user: StorefrontAccessUser | null | undefined) {
  return Boolean(user && !user.isSuperAdmin && Array.isArray(user.permissions) && user.permissions.includes("*"));
}

export function canAccessTenantErp(user: StorefrontAccessUser | null | undefined) {
  if (!user || user.isSuperAdmin || !["ECOMMERCE", "POS_MEDICAL"].includes(normalizeBusinessMode(user.businessMode))) return false;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes("*") || ["dashboard.view", "sales.view", "products.view", "inventory.view"].some((code) => permissions.includes(code));
}

export function tenantStorefrontPath(user: StorefrontAccessUser | null | undefined) {
  if (!canAccessTenantErp(user) || normalizeBusinessMode(user?.businessMode) !== "ECOMMERCE") return null;
  const tenantKey = user?.companyCode?.trim() || user?.tenantId?.trim();
  return tenantKey ? `/store/${encodeURIComponent(tenantKey)}` : null;
}

export function tenantMedicalSitePath(user: StorefrontAccessUser | null | undefined) {
  if (!canAccessTenantErp(user) || normalizeBusinessMode(user?.businessMode) !== "POS_MEDICAL") return null;
  const tenantKey = user?.companyCode?.trim() || user?.tenantId?.trim();
  return tenantKey ? `/medical/${encodeURIComponent(tenantKey)}` : null;
}

export function canManageTenantStorefront(user: StorefrontAccessUser | null | undefined, requestedTenant: string) {
  const requested = normalizedTenantKey(requestedTenant);
  if (!requested || !user) return false;
  if (user.isSuperAdmin) return ["ATELIER-NOIR", "MOON-FORM"].includes(requested);
  if (!tenantStorefrontPath(user)) return false;
  return [user.tenantId, user.companyCode].map(normalizedTenantKey).filter(Boolean).includes(requested);
}

export function canManageTenantMedicalSite(user: StorefrontAccessUser | null | undefined, requestedTenant: string) {
  const requested = normalizedTenantKey(requestedTenant);
  if (!requested || !user) return false;
  if (user.isSuperAdmin) return requested === "ATELIER-CLINIC";
  if (!tenantMedicalSitePath(user)) return false;
  return [user.tenantId, user.companyCode].map(normalizedTenantKey).filter(Boolean).includes(requested);
}