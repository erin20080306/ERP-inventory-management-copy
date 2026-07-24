"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { mutate } from "swr";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/auth";
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart, FileText, Receipt, Warehouse,
  RotateCcw, BookOpen, BookMarked, Coins, Wallet, FileSpreadsheet, BarChart3,
  UserCog, Shield, Settings, History, Building2, ScrollText, Landmark,
  Briefcase, BadgeDollarSign, Building,
  ShoppingBag, Store, ScanBarcode, Cable, FileCheck2, UtensilsCrossed, ChefHat, PanelsTopLeft, ChevronDown, HeartPulse,
} from "lucide-react";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { tenantMedicalSitePath, tenantStorefrontPath } from "@/lib/storefront-access";

type NavItem = { title: string; href: string; icon: any; perm?: string };
type NavSection = { label: string; items: NavItem[] };

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
  "/medical": ["/api/medical/bootstrap", "/api/pos/bootstrap"],
};

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
  { label: "總覽", items: [
    { title: "工作區選擇", href: "/workspace", icon: PanelsTopLeft },
    { title: "儀表板", href: "/dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  ] },
  {
    label: "進銷存",
    items: [
      { title: "商品管理", href: "/products", icon: Package, perm: "products.view" },
      { title: "成本管理", href: "/products/costs", icon: Coins, perm: "products.edit" },
      { title: "客戶管理", href: "/customers", icon: Users, perm: "customers.view" },
      { title: "供應商管理", href: "/suppliers", icon: Truck, perm: "suppliers.view" },
      { title: "採購管理", href: "/purchases", icon: ShoppingCart, perm: "purchases.view" },
      { title: "銷售管理", href: "/sales", icon: Receipt, perm: "sales.view" },
      { title: "報價單", href: "/quotations", icon: FileText, perm: "quotations.view" },
      { title: "庫存管理", href: "/inventory", icon: Warehouse, perm: "inventory.view" },
      { title: "退貨管理", href: "/returns", icon: RotateCcw, perm: "returns.view" },
    ],
  },
  {
    label: "會計",
    items: [
      { title: "會計科目", href: "/accounting/accounts", icon: BookOpen, perm: "accounting.view" },
      { title: "傳票管理", href: "/accounting/journals", icon: BookMarked, perm: "journals.view" },
      { title: "應收帳款", href: "/accounting/receivables", icon: Coins, perm: "receivables.view" },
      { title: "應付帳款", href: "/accounting/payables", icon: Wallet, perm: "payables.view" },
      { title: "已沖帳記錄", href: "/accounting/payments", icon: Receipt, perm: "receivables.view" },
      { title: "應收票據", href: "/accounting/notes-receivable", icon: ScrollText, perm: "notes.view" },
      { title: "應付票據", href: "/accounting/notes-payable", icon: ScrollText, perm: "notes.view" },
      { title: "現金銀行", href: "/accounting/cash", icon: Wallet, perm: "cash.view" },
      { title: "發票管理", href: "/accounting/invoices", icon: FileSpreadsheet, perm: "invoices.view" },
      { title: "固定資產", href: "/accounting/fixed-assets", icon: Landmark, perm: "assets.view" },
    ],
  },
  {
    label: "人事薪資",
    items: [
      { title: "員工管理", href: "/hr/employees", icon: Briefcase, perm: "hr.view" },
      { title: "部門管理", href: "/hr/departments", icon: Building, perm: "hr.view" },
      { title: "薪資管理", href: "/hr/payroll", icon: BadgeDollarSign, perm: "payroll.view" },
    ],
  },
  { label: "報表", items: [
    { title: "財務報表", href: "/reports", icon: BarChart3, perm: "reports.view" },
    { title: "BOM 總覽", href: "/bom", icon: FileSpreadsheet, perm: "inventory.view" },
  ] },
  {
    label: "系統",
    items: [
      { title: "使用者管理", href: "/users", icon: UserCog, perm: "users.view" },
      { title: "角色權限", href: "/roles", icon: Shield, perm: "roles.view" },
      { title: "系統設定", href: "/settings", icon: Settings, perm: "settings.view" },
      { title: "稽核紀錄", href: "/audit", icon: History, perm: "audit.view" },
    ],
  },
];

const retailPosFront: NavSection =
  {
    label: "零售 POS 前台",
    items: [
      { title: "POS 收銀台", href: "/pos", icon: ScanBarcode, perm: "pos.view" },
      { title: "電子發票佇列", href: "/pos/e-invoices", icon: FileCheck2, perm: "pos.view" },
      { title: "硬體模擬診斷", href: "/pos/hardware", icon: Cable, perm: "pos.view" },
      { title: "促銷與店長授權", href: "/pos/offers", icon: BadgeDollarSign, perm: "pos.approve" },
    ],
  };

const restaurantPosFront: NavSection = {
  label: "餐飲 POS 前台",
  items: [
    { title: "桌位與圖片點餐", href: "/pos/restaurant", icon: UtensilsCrossed, perm: "restaurant.view" },
    { title: "廚房出餐看板", href: "/pos/restaurant/kitchen", icon: ChefHat, perm: "restaurant.view" },
    { title: "電子發票佇列", href: "/pos/e-invoices", icon: FileCheck2, perm: "pos.view" },
    { title: "硬體模擬診斷", href: "/pos/hardware", icon: Cable, perm: "pos.view" },
  ],
};

const medicalPosFront = (medicalSiteHref: string | null): NavSection => ({
  label: "醫美 POS 前台",
  items: [
    ...(medicalSiteHref ? [{ title: "進入診所官網", href: medicalSiteHref, icon: Store }] : []),
    { title: "醫美櫃台與收據", href: "/medical", icon: HeartPulse, perm: "medical.view" },
  ],
});

const posBackendSections: NavSection[] = [
  {
    label: "進銷存後台",
    items: [
      { title: "商品與圖片售價", href: "/products", icon: Package, perm: "products.view" },
      { title: "會員／客戶", href: "/customers", icon: Users, perm: "customers.view" },
      { title: "銷售與退換貨", href: "/sales", icon: Receipt, perm: "sales.view" },
      { title: "退貨管理", href: "/returns", icon: RotateCcw, perm: "returns.view" },
      { title: "即時庫存", href: "/inventory", icon: Warehouse, perm: "inventory.view" },
      { title: "採購補貨", href: "/purchases", icon: ShoppingCart, perm: "purchases.view" },
      { title: "供應商", href: "/suppliers", icon: Truck, perm: "suppliers.view" },
      { title: "倉庫／門市", href: "/warehouses", icon: Store, perm: "inventory.view" },
    ],
  },
  {
    label: "會計與分析",
    items: [
      { title: "營運報表", href: "/reports", icon: BarChart3, perm: "reports.view" },
      { title: "應收與收款", href: "/accounting/receivables", icon: Coins, perm: "receivables.view" },
      { title: "發票管理", href: "/accounting/invoices", icon: FileSpreadsheet, perm: "invoices.view" },
      { title: "會計傳票", href: "/accounting/journals", icon: BookMarked, perm: "journals.view" },
      { title: "應付帳款", href: "/accounting/payables", icon: Wallet, perm: "payables.view" },
      { title: "現金銀行", href: "/accounting/cash", icon: Landmark, perm: "cash.view" },
    ],
  },
  {
    label: "系統",
    items: [
      { title: "使用者管理", href: "/users", icon: UserCog, perm: "users.view" },
      { title: "角色權限", href: "/roles", icon: Shield, perm: "roles.view" },
      { title: "系統設定", href: "/settings", icon: Settings, perm: "settings.view" },
      { title: "稽核紀錄", href: "/audit", icon: History, perm: "audit.view" },
    ],
  },
];

const medicalBackendSections = posBackendSections.map((section) => ({
  ...section,
  items: section.items.filter((item) => item.title !== "發票管理"),
}));

const adminSections: NavSection[] = [
  {
    label: "管理者工作區",
    items: [
      { title: "平台授權後台", href: "/admin", icon: Shield },
      { title: "工作區選擇", href: "/workspace", icon: PanelsTopLeft },
      { title: "一般企業 ERP", href: "/dashboard", icon: LayoutDashboard },
      { title: "電商租戶網站", href: "/store/atelier-noir", icon: Store },
      { title: "零售 POS", href: "/pos", icon: ShoppingBag },
      { title: "餐飲桌位與廚房", href: "/pos/restaurant", icon: UtensilsCrossed },
      { title: "醫美診所營運 POS", href: "/medical", icon: HeartPulse },
      { title: "醫美診所網站", href: "/medical/atelier-clinic", icon: Store },
      { title: "電子發票佇列", href: "/pos/e-invoices", icon: FileCheck2 },
      { title: "POS 硬體診斷", href: "/pos/hardware", icon: Cable },
      { title: "促銷與店長授權", href: "/pos/offers", icon: BadgeDollarSign },
    ],
  },
  ...erpSections.slice(1),
];

export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  const { data } = useSession();
  const mode = normalizeBusinessMode(data?.user?.businessMode);
  const isPos = ["POS_RETAIL", "POS_RESTAURANT", "POS_MEDICAL"].includes(mode) && !data?.user?.isSuperAdmin;
  const isRestaurant = mode === "POS_RESTAURANT" && !data?.user?.isSuperAdmin;
  const isCommerce = mode === "ECOMMERCE" && !data?.user?.isSuperAdmin;
  const isMedical = mode === "POS_MEDICAL" && !data?.user?.isSuperAdmin;
  return (
    <div className={cn("flex h-16 shrink-0 items-center border-b border-white/10", collapsed ? "justify-center px-2" : "gap-2 px-5")}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-emerald-500 text-white">
        <Building2 className="h-5 w-5" />
      </div>
      {!collapsed && (
        <div>
          <div className="font-semibold text-sm">{isCommerce ? "電商 ERP" : isMedical ? "醫美 POS" : isRestaurant ? "餐飲 POS" : isPos ? "零售 POS" : "艾琳 ERP 系統"}</div>
          <div className="text-[10px] text-white/50">{isCommerce ? "Commerce Edition" : isMedical ? "Medical Aesthetics Edition" : isRestaurant ? "Restaurant Edition" : isPos ? "Retail Edition" : "Enterprise Edition"}</div>
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {  const pathname = usePathname();
  const router = useRouter();
  const { data } = useSession();
  const perms = data?.user?.permissions ?? [];
  const permKey = perms.join("|");
  const businessMode = normalizeBusinessMode(data?.user?.businessMode);
  const storefrontHref = tenantStorefrontPath(data?.user);
  const medicalSiteHref = tenantMedicalSitePath(data?.user);
  const ecommerceFront: NavSection = {
    label: "電商營運",
    items: [
      ...(storefrontHref ? [{ title: "進入商店官網", href: storefrontHref, icon: Store }] : []),
      { title: "網路訂單", href: "/sales", icon: ShoppingBag, perm: "sales.view" },
      { title: "會員／客戶", href: "/customers", icon: Users, perm: "customers.view" },
      { title: "商品與網站庫存", href: "/products", icon: Package, perm: "products.view" },
    ],
  };
  const sections = data?.user?.isSuperAdmin
    ? adminSections
    : businessMode === "ECOMMERCE"
      ? [erpSections[0], ecommerceFront, ...posBackendSections]
      : businessMode === "POS_MEDICAL"
        ? [erpSections[0], medicalPosFront(medicalSiteHref), ...medicalBackendSections]
      : businessMode === "POS_RESTAURANT"
        ? [erpSections[0], restaurantPosFront, ...posBackendSections]
        : businessMode === "POS_RETAIL"
          ? [erpSections[0], retailPosFront, ...posBackendSections]
          : erpSections;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const sectionLabelsKey = sections.map((section) => section.label).join("|");
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
      section.label,
      saved[section.label] ?? (section.label === "總覽" || section.label === "管理者工作區" || sectionContainsCurrentPath(section)),
    ])) as Record<string, boolean>;
    for (const section of sections) {
      if (section.label === "總覽" || section.label === "管理者工作區" || sectionContainsCurrentPath(section)) {
        next[section.label] = true;
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
    const next = Object.fromEntries(sections.map((section) => [section.label, expanded])) as Record<string, boolean>;
    const activeSection = sections.find(sectionContainsCurrentPath);
    if (!expanded && activeSection) next[activeSection.label] = true;
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
  }, [permKey, warmRoute, sections]);

  return (
    <nav className="flex-1 overflow-y-auto py-3">
      {!collapsed && (
        <div className="mb-2 flex items-center justify-end gap-1 px-3">
          <button type="button" onClick={() => updateAllSections(true)} className="rounded px-2 py-1 text-[10px] text-white/45 hover:bg-white/5 hover:text-white/80">全部展開</button>
          <button type="button" onClick={() => updateAllSections(false)} className="rounded px-2 py-1 text-[10px] text-white/45 hover:bg-white/5 hover:text-white/80">全部收合</button>
        </div>
      )}
      {sections.map((s, sectionIndex) => {
        const visible = s.items.filter((i) => !i.perm || hasPermission(perms, i.perm));
        if (visible.length === 0) return null;
        const containsActiveItem = visible.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
        const expanded = openSections[s.label] ?? (s.label === "總覽" || s.label === "管理者工作區" || containsActiveItem);
        const regionId = `sidebar-section-${sectionIndex}`;
        return (
          <div key={s.label} className={cn("mb-1.5", collapsed ? "border-b border-white/5 px-1 pb-1" : "px-2")}>
            {!collapsed && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={regionId}
                onClick={() => updateSectionState(s.label, !expanded)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest transition-colors",
                  containsActiveItem ? "bg-white/[0.06] text-white/75" : "text-white/40 hover:bg-white/5 hover:text-white/70"
                )}
              >
                <span>{s.label}</span>
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
                        title={collapsed ? i.title : undefined}
                        aria-label={collapsed ? i.title : undefined}
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
                        {!collapsed && <span>{i.title}</span>}
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
  return (
    <div className={cn("shrink-0 border-t border-white/10 text-[10px] text-white/40", collapsed ? "px-2 py-4 text-center" : "p-4")}>
      {collapsed ? "ERP" : <>艾琳 ERP · © {new Date().getFullYear()}</>}
    </div>
  );
}
