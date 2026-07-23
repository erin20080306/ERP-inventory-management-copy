import { readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => { writeFileSync(path, content); console.log(`${path}: updated`); };

function replaceExact(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`找不到定位點：${label}`);
  return source.replace(search, replacement);
}

{
  const path = "src/lib/storefront-access.ts";
  let source = read(path);
  if (!source.includes("export function canAccessTenantErp")) {
    const start = source.indexOf("export function isTenantHighestPrivilege");
    if (start < 0) throw new Error("找不到 storefront access 函式");
    const replacement = [
      'export function isTenantHighestPrivilege(user: StorefrontAccessUser | null | undefined) {',
      '  return Boolean(user && !user.isSuperAdmin && Array.isArray(user.permissions) && user.permissions.includes("*"));',
      '}',
      '',
      'export function canAccessTenantErp(user: StorefrontAccessUser | null | undefined) {',
      '  if (!user || user.isSuperAdmin || normalizeBusinessMode(user.businessMode) !== "ECOMMERCE") return false;',
      '  const permissions = Array.isArray(user.permissions) ? user.permissions : [];',
      '  return permissions.includes("*") || ["dashboard.view", "sales.view", "products.view", "inventory.view"].some((code) => permissions.includes(code));',
      '}',
      '',
      'export function tenantStorefrontPath(user: StorefrontAccessUser | null | undefined) {',
      '  if (!canAccessTenantErp(user)) return null;',
      '  const tenantKey = user?.companyCode?.trim() || user?.tenantId?.trim();',
      '  return tenantKey ? `/store/${encodeURIComponent(tenantKey)}` : null;',
      '}',
      '',
      'export function canManageTenantStorefront(user: StorefrontAccessUser | null | undefined, requestedTenant: string) {',
      '  const requested = normalizedTenantKey(requestedTenant);',
      '  if (!requested || !user) return false;',
      '  if (user.isSuperAdmin) return ["ATELIER-NOIR", "MOON-FORM"].includes(requested);',
      '  if (!tenantStorefrontPath(user)) return false;',
      '  return [user.tenantId, user.companyCode].map(normalizedTenantKey).filter(Boolean).includes(requested);',
      '}',
      '',
    ].join("\n");
    source = `${source.slice(0, start)}${replacement}`;
  }
  write(path, source);
}

{
  const path = "src/app/store/[tenant]/[[...view]]/page.tsx";
  let source = read(path);
  source = replaceExact(
    source,
    `  const managerAccess = canManageTenantStorefront(session?.user, tenant);
  return <FashionStorefront tenant={tenant} initialView={view[0] || "home"} managerAccess={managerAccess} />;`,
    `  const managerAccess = canManageTenantStorefront(session?.user, tenant);
  const managerBackHref = session?.user?.isSuperAdmin ? "/admin" : "/products";
  const managerErpHref = session?.user?.isSuperAdmin ? "/workspace" : "/dashboard";
  return <FashionStorefront tenant={tenant} initialView={view[0] || "home"} managerAccess={managerAccess} managerBackHref={managerBackHref} managerErpHref={managerErpHref} />;`,
    "商城切換 props",
  );
  write(path, source);
}

{
  const path = "src/app/store/[tenant]/[[...view]]/storefront.tsx";
  let source = read(path);
  source = source.replace(
    "export function FashionStorefront({ tenant, initialView, managerAccess = false }: { tenant: string; initialView: string; managerAccess?: boolean }) {",
    "export function FashionStorefront({ tenant, initialView, managerAccess = false, managerBackHref = \"/products\", managerErpHref = \"/dashboard\" }: { tenant: string; initialView: string; managerAccess?: boolean; managerBackHref?: string; managerErpHref?: string }) {",
  );
  source = source.replace(
    '<Link href="/products"><ArrowLeft size={16} />回到電商後台</Link>\n            <Link href="/dashboard"><BarChart3 size={16} />進入 ERP</Link>',
    '<Link href={managerBackHref}><ArrowLeft size={16} />{managerBackHref === "/admin" ? "回平台管理" : "回到電商後台"}</Link>\n            <Link href={managerErpHref}><BarChart3 size={16} />切換 ERP</Link>',
  );
  write(path, source);
}

{
  const path = "src/app/(app)/workspace/page.tsx";
  let source = read(path);
  source = source.replace(
    '    if ((mode === "ERP" || mode === "ECOMMERCE") && hasPermission(permissions, "dashboard.view")) redirect("/dashboard");',
    '    if (mode === "ERP" && hasPermission(permissions, "dashboard.view")) redirect("/dashboard");',
  );
  if (!source.includes('title: "進入 ERP 營運後台"')) {
    const marker = '      : []),\n    ...((mode === "POS_RETAIL" || isPlatformAdmin)';
    const addition = '      : []),\n    ...((mode === "ECOMMERCE" || isPlatformAdmin) && hasPermission(permissions, "dashboard.view")\n      ? [{ title: "進入 ERP 營運後台", description: "網路訂單、商品、庫存、出貨、應收與會計整合管理", href: "/dashboard", icon: Building2, tone: "indigo" }]\n      : []),\n    ...((mode === "POS_RETAIL" || isPlatformAdmin)';
    source = replaceExact(source, marker, addition, "ERP 工作區卡片");
  }
  write(path, source);
}

{
  const path = "src/app/admin/page.tsx";
  let source = read(path);
  source = source.replace(
    "Loader2, LogOut, Mail, MonitorSmartphone, RefreshCw, Search, Shield, ShoppingBag, Store, Users, X, UtensilsCrossed, Download,",
    "Loader2, LogOut, Mail, MonitorSmartphone, RefreshCw, Search, Shield, ShoppingBag, Store, Users, X, UtensilsCrossed, Download, PanelsTopLeft,",
  );
  source = source.replace(
    '<Link href="/dashboard" className="admin-button bg-indigo-600 hover:bg-indigo-500"><LayoutDashboard className="h-4 w-4" />一般企業 ERP 後台</Link>',
    '<Link href="/workspace" className="admin-button bg-indigo-600 hover:bg-indigo-500"><PanelsTopLeft className="h-4 w-4" />切換 ERP／電商工作區</Link>',
  );
  write(path, source);
}

console.log("Ecommerce ERP switching patch applied.");
