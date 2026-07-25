const RESERVED_TENANT_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "erp",
  "mail",
  "smtp",
  "cdn",
  "assets",
]);

function stripPort(value: string) {
  return value.replace(/:\d+$/, "");
}

export function normalizeRootDomain(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const withoutProtocol = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = stripPort(withoutProtocol.split("/")[0].split("?")[0].split("#")[0]);
  return host
    .replace(/^\*\./, "")
    .replace(/^www\./, "")
    .replace(/^\.+|\.+$/g, "");
}

export function normalizeRequestHost(value: unknown) {
  const raw = String(value ?? "").split(",")[0].trim().toLowerCase();
  if (!raw) return "";
  const withoutProtocol = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  return stripPort(withoutProtocol.split("/")[0]);
}

export function tenantSubdomainLabel(value: unknown) {
  const label = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return null;
  if (RESERVED_TENANT_SUBDOMAINS.has(label)) return null;
  return label;
}

export function tenantSubdomainFromHost(hostValue: unknown, rootDomainValue: unknown) {
  const host = normalizeRequestHost(hostValue);
  const rootDomain = normalizeRootDomain(rootDomainValue);
  if (!host || !rootDomain || host === rootDomain || host === `www.${rootDomain}`) return null;
  const suffix = `.${rootDomain}`;
  if (!host.endsWith(suffix)) return null;
  const candidate = host.slice(0, -suffix.length);
  if (!candidate || candidate.includes(".")) return null;
  return tenantSubdomainLabel(candidate);
}

export function tenantSiteRewritePath(slugValue: unknown, pathnameValue: unknown) {
  const slug = tenantSubdomainLabel(slugValue);
  if (!slug) return null;
  const pathname = String(pathnameValue || "/");
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `/site/${encodeURIComponent(slug)}${normalizedPath === "/" ? "" : normalizedPath}`;
}
