"use client";

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
      className={`relative hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex ${collapsed ? "w-20" : "w-64"}`}
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
