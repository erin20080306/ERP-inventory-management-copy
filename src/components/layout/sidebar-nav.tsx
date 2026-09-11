"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { mutate } from "swr";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart, FileText, Receipt, Warehouse,
  RotateCcw, BookOpen, BookMarked, Coins, Wallet, FileSpreadsheet, BarChart3,
  UserCog, Shield, Settings, History, Building2, ScrollText, Landmark,
  Briefcase, BadgeDollarSign, Building,
  ShoppingBag, Store, ScanBarcode, Cable, FileCheck2, UtensilsCrossed, ChefHat, PanelsTopLeft, ChevronDown, HeartPulse,
} from "lucide-react";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { tenantMedicalSitePath, tenantStorefrontPath } from "@/lib/storefront-access";
import { useTranslations } from "next-intl";

// key 對應 messages/*.json 的 nav.items / nav.sections，
// 顯示文字一律在渲染時翻譯，避免把語言寫死在路由設定裡。
type NavItem = { key: string; href: string; icon: any; perm?: string };
type NavSection = { key: string; items: NavItem[] };

const DATA_PREFETCH_BY_HREF: Record<string, string[]> = {
  "/products": ["/api/products?q=&page=1&pageSize=20"],
  "/products/costs": ["/api/products?q=&page=1&pageSize=20"],
  "/customers": ["/api/customers?q=&page=1&pageSize=20"],
  "/suppliers": ["/api/suppliers?q=&page=1&pageSize=20"],
  "/purchases": ["/api/purchases?q=&page=1&pageSize=20"],
  "/sales": ["/api/sales?q=&page=1&pageSize=20"],
  "/quotations": ["/api/quotations?q=&page=1&pageSize=20"],
  "/inventory": ["/api/inventory/stocks?q=", "/api/inventory/transactions?q="],
  "/accounting/accounts": ["/api/accounting/accounts?q=&page=1&pageSize=20"],
  "/accounting/journals": ["/api/accounting/journals?q=&page=1&pageSize=20"],
  "/accounting/receivables": ["/api/accounting/receivables?q=&page=1&pageSize=20"],
  "/accounting/payables": ["/api/accounting/payables?q=&page=1&pageSize=20"],
  "/accounting/invoices": ["/api/accounting/invoices?q=&page=1&pageSize=20"],
  "/accounting/fixed-assets": ["/api/accounting/fixed-assets?q=&page=1&pageSize=20"],
  "/warehouses": ["/api/warehouses?q=&page=1&pageSize=20"],
  "/users": ["/api/users?q=&page=1&pageSize=20"],
  "/roles": ["/api/roles"],
  "/pos": ["/api/pos/bootstrap"],
  "/pos/restaurant": ["/api/pos/restaurant"],
  "/medical": ["/api/medical/bootstrap"],
  "/fulfillment": ["/api/sales?q=&page=1&pageSize=20&channel=WEB&status=SUBMITTED%2CAPPROVED%2CPARTIALLY_SHIPPED"],
};

// 這兩個區塊永遠預設展開，改以穩定 key 判斷，不受介面語言影響。
const ALWAYS_OPEN_SECTION_KEYS = ["overview", "adminWorkspace"];

const warmedRoutes = new Set<string>();
const warmedData = new Set<string>();

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("prefetch failed");
  return res.json();
}

function prefetchDataForRoute(href: string) {
  for (const key of DATA_PREFETCH_BY_HREF[href] ?? []) {
    if (warmedData.has(key)) continue;
    warmedData.add(key);
    void mutate(key, fetchJson(key), { populateCache: true, revalidate: false });
  }
}

const erpSections: NavSection[] = [
  { key: "overview", items: [
    { key: "workspace", href: "/workspace", icon: PanelsTopLeft },
    { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  ] },
  {
    key: "inventoryTrade",
    items: [
      { key: "products", href: "/products", icon: Package, perm: "products.view" },
      { key: "productCosts", href: "/products/costs", icon: Coins, perm: "products.edit" },
      { key: "customers", href: "/customers", icon: Users, perm: "customers.view" },
      { key: "suppliers", href: "/suppliers", icon: Truck, perm: "suppliers.view" },
      { key: "purchases", href: "/purchases", icon: ShoppingCart, perm: "purchases.view" },
      { key: "sales", href: "/sales", icon: Receipt, perm: "sales.view" },
      { key: "quotations", href: "/quotations", icon: FileText, perm: "quotations.view" },
      { key: "inventory", href: "/inventory", icon: Warehouse, perm: "inventory.view" },
      { key: "returns", href: "/returns", icon: RotateCcw, perm: "returns.view" },
    ],
  },
  {
    key: "accounting",
    items: [
      { key: "accountingAccounts", href: "/accounting/accounts", icon: BookOpen, perm: "accounting.view" },
      { key: "journals", href: "/accounting/journals", icon: BookMarked, perm: "journals.view" },
      { key: "receivables", href: "/accounting/receivables", icon: Coins, perm: "receivables.view" },
      { key: "payables", href: "/accounting/payables", icon: Wallet, perm: "payables.view" },
      { key: "payments", href: "/accounting/payments", icon: Receipt, perm: "receivables.view" },
      { key: "notesReceivable", href: "/accounting/notes-receivable", icon: ScrollText, perm: "notes.view" },
      { key: "notesPayable", href: "/accounting/notes-payable", icon: ScrollText, perm: "notes.view" },
      { key: "cash", href: "/accounting/cash", icon: Wallet, perm: "cash.view" },
      { key: "invoices", href: "/accounting/invoices", icon: FileSpreadsheet, perm: "invoices.view" },
      { key: "fixedAssets", href: "/accounting/fixed-assets", icon: Landmark, perm: "assets.view" },
    ],
  },
  {
    key: "hr",
    items: [
      { key: "hrEmployees", href: "/hr/employees", icon: Briefcase, perm: "hr.view" },
      { key: "hrDepartments", href: "/hr/departments", icon: Building, perm: "hr.view" },
      { key: "payroll", href: "/hr/payroll", icon: BadgeDollarSign, perm: "payroll.view" },
    ],
  },
  { key: "reports", items: [
    { key: "reports", href: "/reports", icon: BarChart3, perm: "reports.view" },
    { key: "bom", href: "/bom", icon: FileSpreadsheet, perm: "inventory.view" },
  ] },
  {
    key: "system",
    items: [
      { key: "users", href: "/users", icon: UserCog, perm: "users.view" },
      { key: "roles", href: "/roles", icon: Shield, perm: "roles.view" },
      { key: "settings", href: "/settings", icon: Settings, perm: "settings.view" },
      { key: "audit", href: "/audit", icon: History, perm: "audit.view" },
    ],
  },
];

const retailPosFront: NavSection =
  {
    key: "retailPosFront",
    items: [
      { key: "posRegister", href: "/pos", icon: ScanBarcode, perm: "pos.view" },
      { key: "posEInvoices", href: "/pos/e-invoices", icon: FileCheck2, perm: "pos.view" },
      { key: "posHardware", href: "/pos/hardware", icon: Cable, perm: "pos.view" },
      { key: "posOffers", href: "/pos/offers", icon: BadgeDollarSign, perm: "pos.approve" },
    ],
  };

const restaurantPosFront: NavSection = {
  key: "restaurantPosFront",
  items: [
    { key: "restaurantTables", href: "/pos/restaurant", icon: UtensilsCrossed, perm: "restaurant.view" },
    { key: "restaurantKitchen", href: "/pos/restaurant/kitchen", icon: ChefHat, perm: "restaurant.view" },
    { key: "posEInvoices", href: "/pos/e-invoices", icon: FileCheck2, perm: "pos.view" },
    { key: "posHardware", href: "/pos/hardware", icon: Cable, perm: "pos.view" },
  ],
};

const medicalPosFront = (medicalSiteHref: string | null): NavSection => ({
  key: "medicalPosFront",
  items: [
    ...(medicalSiteHref ? [{ key: "medicalSite", href: medicalSiteHref, icon: Store }] : []),
    { key: "medicalCounter", href: "/medical", icon: HeartPulse, perm: "medical.view" },
  ],
});

const posBackendSections: NavSection[] = [
  {
    key: "posBackend",
    items: [
      { key: "productsWithMedia", href: "/products", icon: Package, perm: "products.view" },
      { key: "membersCustomers", href: "/customers", icon: Users, perm: "customers.view" },
      { key: "salesAndReturns", href: "/sales", icon: Receipt, perm: "sales.view" },
      { key: "returns", href: "/returns", icon: RotateCcw, perm: "returns.view" },
      { key: "liveInventory", href: "/inventory", icon: Warehouse, perm: "inventory.view" },
      { key: "purchaseReplenishment", href: "/purchases", icon: ShoppingCart, perm: "purchases.view" },
      { key: "suppliersShort", href: "/suppliers", icon: Truck, perm: "suppliers.view" },
      { key: "warehousesStores", href: "/warehouses", icon: Store, perm: "inventory.view" },
    ],
  },
  {
    key: "accountingAnalysis",
    items: [
      { key: "operationReports", href: "/reports", icon: BarChart3, perm: "reports.view" },
      { key: "receivablesAndPayments", href: "/accounting/receivables", icon: Coins, perm: "receivables.view" },
      { key: "invoices", href: "/accounting/invoices", icon: FileSpreadsheet, perm: "invoices.view" },
      { key: "accountingJournals", href: "/accounting/journals", icon: BookMarked, perm: "journals.view" },
      { key: "payables", href: "/accounting/payables", icon: Wallet, perm: "payables.view" },
      { key: "cash", href: "/accounting/cash", icon: Landmark, perm: "cash.view" },
    ],
  },
  {
    key: "system",
    items: [
      { key: "users", href: "/users", icon: UserCog, perm: "users.view" },
      { key: "roles", href: "/roles", icon: Shield, perm: "roles.view" },
      { key: "settings", href: "/settings", icon: Settings, perm: "settings.view" },
      { key: "audit", href: "/audit", icon: History, perm: "audit.view" },
    ],
  },
];

// 醫美帳套不開放發票管理；改以路由比對，翻譯後仍然正確。
const medicalBackendSections = posBackendSections.map((section) => ({
  ...section,
  items: section.items.filter((item) => item.href !== "/accounting/invoices"),
}));

const adminSections = (storefrontHref: string | null, medicalSiteHref: string | null, medicalEnabled: boolean): NavSection[] => [
  {
    key: "adminWorkspace",
    items: [
      { key: "platformAdmin", href: "/admin", icon: Shield },
      { key: "workspace", href: "/workspace", icon: PanelsTopLeft },
      { key: "enterpriseErp", href: "/dashboard", icon: LayoutDashboard },
      ...(storefrontHref ? [{ key: "myStore", href: storefrontHref, icon: Store }] : []),
      { key: "retailPos", href: "/pos", icon: ShoppingBag },
      { key: "restaurantPos", href: "/pos/restaurant", icon: UtensilsCrossed },
      ...(medicalEnabled ? [{ key: "medicalPos", href: "/medical", icon: HeartPulse }] : []),
      ...(medicalEnabled && medicalSiteHref ? [{ key: "myMedicalSite", href: medicalSiteHref, icon: Store }] : []),
      { key: "posEInvoices", href: "/pos/e-invoices", icon: FileCheck2 },
      { key: "posHardwareShort", href: "/pos/hardware", icon: Cable },
      { key: "posOffers", href: "/pos/offers", icon: BadgeDollarSign },
    ],
  },
  ...erpSections.slice(1),
];

export function SidebarBrand({ collapsed = false, medicalEnabled = true }: { collapsed?: boolean; medicalEnabled?: boolean }) {
  const t = useTranslations("brand");
  const { data } = useSession();
  const mode = normalizeBusinessMode(data?.user?.businessMode);
  const isPos = ["POS_RETAIL", "POS_RESTAURANT", "POS_MEDICAL"].includes(mode) && !data?.user?.isSuperAdmin;
  const isRestaurant = mode === "POS_RESTAURANT" && !data?.user?.isSuperAdmin;
  const isCommerce = mode === "ECOMMERCE" && !data?.user?.isSuperAdmin;
  const isMedical = medicalEnabled && mode === "POS_MEDICAL" && !data?.user?.isSuperAdmin;
  return (
    <div className={cn("flex h-16 shrink-0 items-center border-b border-white/10", collapsed ? "justify-center px-2" : "gap-2 px-5")}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-emerald-500 text-white">
        <Building2 className="h-5 w-5" />
      </div>
      {!collapsed && (
        <div>
          <div className="font-semibold text-sm">{t(isCommerce ? "commerce" : isMedical ? "medical" : isRestaurant ? "restaurant" : isPos ? "retail" : "erp")}</div>
          <div className="text-[10px] text-white/50">{t(isCommerce ? "editionCommerce" : isMedical ? "editionMedical" : isRestaurant ? "editionRestaurant" : isPos ? "editionRetail" : "editionEnterprise")}</div>
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ onNavigate, collapsed = false, medicalEnabled = true }: { onNavigate?: () => void; collapsed?: boolean; medicalEnabled?: boolean }) {
  const t = useTranslations("nav");
  const tSection = useTranslations("nav.sections");
  const tItem = useTranslations("nav.items");
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useSession();
  const perms = data?.user?.permissions ?? [];
  const permKey = perms.join("|");
  const businessMode = normalizeBusinessMode(data?.user?.businessMode);
  const storefrontHref = tenantStorefrontPath(data?.user);
  const medicalSiteHref = medicalEnabled ? tenantMedicalSitePath(data?.user) : null;
  const ecommerceFront: NavSection = {
    key: "commerceFront",
    items: [
      ...(storefrontHref ? [{ key: "storefront", href: storefrontHref, icon: Store }] : []),
      { key: "fulfillment", href: "/fulfillment", icon: Truck, perm: "sales.view" },
      { key: "webOrders", href: "/sales", icon: ShoppingBag, perm: "sales.view" },
      { key: "membersCustomers", href: "/customers", icon: Users, perm: "customers.view" },
      { key: "productsWebStock", href: "/products", icon: Package, perm: "products.view" },
    ],
  };
  const sections = data?.user?.isSuperAdmin
    ? adminSections(storefrontHref, medicalSiteHref, medicalEnabled)
    : businessMode === "ECOMMERCE"
      ? [erpSections[0], ecommerceFront, ...posBackendSections]
      : businessMode === "POS_MEDICAL" && medicalEnabled
        ? [erpSections[0], medicalPosFront(medicalSiteHref), ...medicalBackendSections]
      : businessMode === "POS_MEDICAL"
        ? [erpSections[0], ...medicalBackendSections]
      : businessMode === "POS_RESTAURANT"
        ? [erpSections[0], restaurantPosFront, ...posBackendSections]
        : businessMode === "POS_RETAIL"
          ? [erpSections[0], retailPosFront, ...posBackendSections]
          : erpSections;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const sectionLabelsKey = sections.map((section) => section.key).join("|");
  const sidebarStorageKey = `erin-sidebar-sections:${data?.user?.id ?? "anonymous"}:${data?.user?.isSuperAdmin ? "admin" : businessMode}`;

  const sectionContainsCurrentPath = useCallback((section: NavSection) => section.items.some((item) =>
    pathname === item.href || pathname.startsWith(item.href + "/")
  ), [pathname]);

  useEffect(() => {
    if (!data?.user?.id) return;
    let saved: Record<string, boolean> = {};
    try {
      const raw = window.localStorage.getItem(sidebarStorageKey);
      if (raw) saved = JSON.parse(raw);
    } catch {}

    const next = Object.fromEntries(sections.map((section) => [
      section.key,
      saved[section.key] ?? (ALWAYS_OPEN_SECTION_KEYS.includes(section.key) || sectionContainsCurrentPath(section)),
    ])) as Record<string, boolean>;
    for (const section of sections) {
      if (ALWAYS_OPEN_SECTION_KEYS.includes(section.key) || sectionContainsCurrentPath(section)) {
        next[section.key] = true;
      }
    }
    setOpenSections(next);
  }, [data?.user?.id, sectionLabelsKey, sectionContainsCurrentPath, sidebarStorageKey]);

  const updateSectionState = useCallback((label: string, expanded: boolean) => {
    setOpenSections((current) => {
      const next = { ...current, [label]: expanded };
      try { window.localStorage.setItem(sidebarStorageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [sidebarStorageKey]);

  const updateAllSections = useCallback((expanded: boolean) => {
    const next = Object.fromEntries(sections.map((section) => [section.key, expanded])) as Record<string, boolean>;
    const activeSection = sections.find(sectionContainsCurrentPath);
    if (!expanded && activeSection) next[activeSection.key] = true;
    setOpenSections(next);
    try { window.localStorage.setItem(sidebarStorageKey, JSON.stringify(next)); } catch {}
  }, [sections, sectionContainsCurrentPath, sidebarStorageKey]);

  const warmRoute = useCallback((href: string, options?: { data?: boolean }) => {
    if (!warmedRoutes.has(href)) {
      warmedRoutes.add(href);
      router.prefetch(href);
    }
    if (options?.data) prefetchDataForRoute(href);
  }, [router]);

  useEffect(() => {
    // iOS 透過遠端 Vercel 使用 ERP；避免啟動後批量預抓頁面與目前操作競爭頻寬。
    // 使用者觸碰選項時仍會由 onTouchStart 立即預抓目標頁面與資料。
    if (!medicalEnabled) return;
    const visibleHrefs = sections
      .flatMap((section) => section.items)
      .filter((item) => !item.perm || hasPermission(perms, item.perm))
      .map((item) => item.href);
    const warmCommonRoutes = () => visibleHrefs.slice(0, 8).forEach((href) => warmRoute(href));
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warmCommonRoutes, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(warmCommonRoutes, 1200);
    return () => clearTimeout(id);
  }, [medicalEnabled, permKey, warmRoute, sections]);

  return (
    <nav className="flex-1 overflow-y-auto py-3">
      {!collapsed && (
        <div className="mb-2 flex items-center justify-end gap-1 px-3">
          <button type="button" onClick={() => updateAllSections(true)} className="rounded px-2 py-1 text-[10px] text-white/45 hover:bg-white/5 hover:text-white/80">{t("expandAll")}</button>
          <button type="button" onClick={() => updateAllSections(false)} className="rounded px-2 py-1 text-[10px] text-white/45 hover:bg-white/5 hover:text-white/80">{t("collapseAll")}</button>
        </div>
      )}
      {sections.map((s, sectionIndex) => {
        const visible = s.items.filter((i) => !i.perm || hasPermission(perms, i.perm));
        if (visible.length === 0) return null;
        const containsActiveItem = visible.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
        const expanded = openSections[s.key] ?? (ALWAYS_OPEN_SECTION_KEYS.includes(s.key) || containsActiveItem);
        const regionId = `sidebar-section-${sectionIndex}`;
        return (
          <div key={s.key} className={cn("mb-1.5", collapsed ? "border-b border-white/5 px-1 pb-1" : "px-2")}>
            {!collapsed && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={regionId}
                onClick={() => updateSectionState(s.key, !expanded)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest transition-colors",
                  containsActiveItem ? "bg-white/[0.06] text-white/75" : "text-white/40 hover:bg-white/5 hover:text-white/70"
                )}
              >
                <span>{tSection(s.key)}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded ? "rotate-0" : "-rotate-90")} />
              </button>
            )}
            {(collapsed || expanded) && (
              <ul id={regionId} className={cn("space-y-0.5", collapsed ? "mt-0 px-0" : "mt-1 px-1")}>
                {visible.map((i) => {
                  const active = pathname === i.href || pathname.startsWith(i.href + "/");
                  const Icon = i.icon;
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        prefetch={medicalEnabled}
                        title={collapsed ? tItem(i.key) : undefined}
                        aria-label={collapsed ? tItem(i.key) : undefined}
                        onClick={() => {
                          warmRoute(i.href, { data: true });
                          onNavigate?.();
                        }}
                        onMouseEnter={() => warmRoute(i.href, { data: true })}
                        onFocus={() => warmRoute(i.href, { data: true })}
                        onTouchStart={() => warmRoute(i.href, { data: true })}
                        className={cn(
                          "flex rounded-md py-2 text-sm transition-colors",
                          collapsed ? "items-center justify-center px-2" : "items-center gap-3 px-3",
                          active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
                        {!collapsed && <span>{tItem(i.key)}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function SidebarFooter({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations("brand");
  return (
    <div className={cn("shrink-0 border-t border-white/10 text-[10px] text-white/40", collapsed ? "px-2 py-4 text-center" : "p-4")}>
      {collapsed ? "ERP" : <>{t("system")} · © {new Date().getFullYear()}</>}
    </div>
  );
}
