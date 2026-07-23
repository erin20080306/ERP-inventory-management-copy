import { readFileSync, writeFileSync } from "node:fs";

const sidebarPath = "src/components/layout/sidebar.tsx";
const navPath = "src/components/layout/sidebar-nav.tsx";

writeFileSync(sidebarPath, `"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SidebarBrand, SidebarNav, SidebarFooter } from "./sidebar-nav";

const SIDEBAR_COLLAPSED_KEY = "erin-sidebar-collapsed";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  return (
    <aside
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      className={\`relative hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex \${collapsed ? "w-20" : "w-64"}\`}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "展開左側選單" : "向左收合選單"}
        title={collapsed ? "展開左側選單" : "向左收合選單"}
        className="absolute -right-3 top-20 z-30 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-foreground shadow-md transition hover:scale-105 hover:bg-muted"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      <SidebarBrand collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}
`);

let source = readFileSync(navPath, "utf8");

const brandStart = source.indexOf("export function SidebarBrand");
const navStart = source.indexOf("export function SidebarNav", brandStart);
const navLineEnd = source.indexOf("\n", navStart);
if (brandStart < 0 || navStart < 0 || navLineEnd < 0) throw new Error("找不到 SidebarBrand／SidebarNav 定位點");

const brandAndNavSignature = `export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  const { data } = useSession();
  const mode = normalizeBusinessMode(data?.user?.businessMode);
  const isPos = ["POS_RETAIL", "POS_RESTAURANT"].includes(mode) && !data?.user?.isSuperAdmin;
  const isRestaurant = mode === "POS_RESTAURANT" && !data?.user?.isSuperAdmin;
  const isCommerce = mode === "ECOMMERCE" && !data?.user?.isSuperAdmin;
  return (
    <div className={cn("flex h-16 shrink-0 items-center border-b border-white/10", collapsed ? "justify-center px-2" : "gap-2 px-5")}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-emerald-500 text-white">
        <Building2 className="h-5 w-5" />
      </div>
      {!collapsed && (
        <div>
          <div className="font-semibold text-sm">{isCommerce ? "電商 ERP" : isRestaurant ? "餐飲 POS" : isPos ? "零售 POS" : "艾琳 ERP 系統"}</div>
          <div className="text-[10px] text-white/50">{isCommerce ? "Commerce Edition" : isRestaurant ? "Restaurant Edition" : isPos ? "Retail Edition" : "Enterprise Edition"}</div>
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {`;
source = `${source.slice(0, brandStart)}${brandAndNavSignature}${source.slice(navLineEnd + 1)}`;

const currentNavStart = source.indexOf("export function SidebarNav");
const renderStart = source.indexOf('  return (\n    <nav className="flex-1 overflow-y-auto py-3">', currentNavStart);
const footerStart = source.indexOf("export function SidebarFooter", renderStart);
if (renderStart < 0 || footerStart < 0) throw new Error("找不到 SidebarNav render／SidebarFooter 定位點");

const newRender = `  return (
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
        const regionId = \`sidebar-section-\${sectionIndex}\`;
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

`;
source = `${source.slice(0, renderStart)}${newRender}${source.slice(footerStart)}`;

const footerCurrentStart = source.indexOf("export function SidebarFooter");
if (footerCurrentStart < 0) throw new Error("找不到 SidebarFooter");
source = `${source.slice(0, footerCurrentStart)}export function SidebarFooter({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn("shrink-0 border-t border-white/10 text-[10px] text-white/40", collapsed ? "px-2 py-4 text-center" : "p-4")}>
      {collapsed ? "ERP" : <>艾琳 ERP · © {new Date().getFullYear()}</>}
    </div>
  );
}
`;

writeFileSync(navPath, source);
console.log("Sidebar section accordions preserved; whole sidebar rail collapse added.");
