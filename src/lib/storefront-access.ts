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
  return Boolean(
    user &&
    !user.isSuperAdmin &&
    Array.isArray(user.permissions) &&
    user.permissions.includes("*")
  );
}

export function tenantStorefrontPath(user: StorefrontAccessUser | null | undefined) {
  if (!isTenantHighestPrivilege(user) || normalizeBusinessMode(user?.businessMode) !== "ECOMMERCE") return null;
  const tenantKey = user?.companyCode?.trim() || user?.tenantId?.trim();
  return tenantKey ? `/store/${encodeURIComponent(tenantKey)}` : null;
}

export function canManageTenantStorefront(
  user: StorefrontAccessUser | null | undefined,
  requestedTenant: string,
) {
  if (!tenantStorefrontPath(user)) return false;
  const requested = normalizedTenantKey(requestedTenant);
  if (!requested) return false;
  return [user?.tenantId, user?.companyCode]
    .map(normalizedTenantKey)
    .filter(Boolean)
    .includes(requested);
}
