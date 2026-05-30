"use client";
import Link from "next/link";
import { useCallback, useEffect } from "react";
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
} from "lucide-react";

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

const sections: NavSection[] = [
  { label: "總覽", items: [{ title: "儀表板", href: "/dashboard", icon: LayoutDashboard, perm: "dashboard.view" }] },
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

export function SidebarBrand() {
  return (
    <div className="flex h-16 items-center gap-2 px-5 border-b border-white/10 shrink-0">
      <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 to-emerald-500 text-white flex items-center justify-center">
        <Building2 className="h-5 w-5" />
      </div>
      <div>
        <div className="font-semibold text-sm">專業 ERP 系統</div>
        <div className="text-[10px] text-white/50">Enterprise Edition</div>
      </div>
    </div>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useSession();
  const perms = data?.user?.permissions ?? [];
  const permKey = perms.join("|");

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
  }, [permKey, warmRoute]);

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      {sections.map((s) => {
        const visible = s.items.filter((i) => !i.perm || hasPermission(perms, i.perm));
        if (visible.length === 0) return null;
        return (
          <div key={s.label} className="mb-4">
            <div className="px-5 pb-2 text-[10px] font-semibold tracking-widest text-white/40 uppercase">
              {s.label}
            </div>
            <ul className="space-y-0.5 px-3">
              {visible.map((i) => {
                const active = pathname === i.href || pathname.startsWith(i.href + "/");
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => {
                        warmRoute(i.href, { data: true });
                        onNavigate?.();
                      }}
                      onMouseEnter={() => warmRoute(i.href, { data: true })}
                      onFocus={() => warmRoute(i.href, { data: true })}
                      onTouchStart={() => warmRoute(i.href, { data: true })}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{i.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function SidebarFooter() {
  return (
    <div className="border-t border-white/10 p-4 text-[10px] text-white/40 shrink-0">
      v1.0.0 · © {new Date().getFullYear()}
    </div>
  );
}
