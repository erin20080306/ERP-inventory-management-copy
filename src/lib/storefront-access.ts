import { normalizeBusinessMode, type BusinessMode } from "./product-editions";
import { medicalSitePath, storefrontPath } from "./public-site-links";

export type StorefrontAccessUser = {
  tenantId?: string | null;
  companyCode?: string | null;
  storeSlug?: string | null;
  permissions?: string[] | null;
  businessMode?: BusinessMode | string | null;
  isSuperAdmin?: boolean | null;
  isTenantOwner?: boolean | null;
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
  return Boolean(user && !user.isSuperAdmin && user.isTenantOwner);
}

export function canAccessTenantErp(user: StorefrontAccessUser | null | undefined) {
  if (!user || user.isSuperAdmin || !["ECOMMERCE", "POS_MEDICAL"].includes(normalizeBusinessMode(user.businessMode))) return false;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes("*") || ["dashboard.view", "sales.view", "products.view", "inventory.view"].some((code) => permissions.includes(code));
}

export function tenantStorefrontPath(user: StorefrontAccessUser | null | undefined) {
  if (user?.isSuperAdmin) {
    if (normalizedTenantKey(user.companyCode) !== "ERIN-INTERNAL") return null;
    const tenantKey = user.storeSlug?.trim() || user.companyCode?.trim() || user.tenantId?.trim();
    return tenantKey ? storefrontPath(tenantKey) : null;
  }
  if (!canAccessTenantErp(user) || normalizeBusinessMode(user?.businessMode) !== "ECOMMERCE") return null;
  const tenantKey = user?.storeSlug?.trim() || user?.companyCode?.trim() || user?.tenantId?.trim();
  return tenantKey ? storefrontPath(tenantKey) : null;
}

export function tenantMedicalSitePath(user: StorefrontAccessUser | null | undefined) {
  if (user?.isSuperAdmin) {
    if (normalizedTenantKey(user.companyCode) !== "ERIN-INTERNAL") return null;
    const tenantKey = user.storeSlug?.trim() || user.companyCode?.trim() || user.tenantId?.trim();
    return tenantKey ? medicalSitePath(tenantKey) : null;
  }
  if (!canAccessTenantErp(user) || normalizeBusinessMode(user?.businessMode) !== "POS_MEDICAL") return null;
  const tenantKey = user?.storeSlug?.trim() || user?.companyCode?.trim() || user?.tenantId?.trim();
  return tenantKey ? medicalSitePath(tenantKey) : null;
}

export function canManageTenantStorefront(user: StorefrontAccessUser | null | undefined, requestedTenant: string) {
  const requested = normalizedTenantKey(requestedTenant);
  if (!requested || !user) return false;
  if (user.isSuperAdmin) {
    const internalKeys = normalizedTenantKey(user.companyCode) === "ERIN-INTERNAL"
      ? [user.tenantId, user.companyCode, user.storeSlug]
      : [];
    return ["ATELIER-NOIR", "MOON-FORM", ...internalKeys]
      .map(normalizedTenantKey)
      .filter(Boolean)
      .includes(requested);
  }
  if (!isTenantHighestPrivilege(user) || !tenantStorefrontPath(user)) return false;
  return [user.tenantId, user.companyCode, user.storeSlug].map(normalizedTenantKey).filter(Boolean).includes(requested);
}

export function canManageTenantMedicalSite(user: StorefrontAccessUser | null | undefined, requestedTenant: string) {
  const requested = normalizedTenantKey(requestedTenant);
  if (!requested || !user) return false;
  if (user.isSuperAdmin) {
    const internalKeys = normalizedTenantKey(user.companyCode) === "ERIN-INTERNAL"
      ? [user.tenantId, user.companyCode, user.storeSlug]
      : [];
    return ["ATELIER-CLINIC", ...internalKeys]
      .map(normalizedTenantKey)
      .filter(Boolean)
      .includes(requested);
  }
  if (!isTenantHighestPrivilege(user) || !tenantMedicalSitePath(user)) return false;
  return [user.tenantId, user.companyCode, user.storeSlug].map(normalizedTenantKey).filter(Boolean).includes(requested);
}
