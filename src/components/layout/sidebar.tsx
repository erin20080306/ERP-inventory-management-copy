"use client";
import { SidebarBrand, SidebarNav, SidebarFooter } from "./sidebar-nav";

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <SidebarBrand />
      <SidebarNav />
      <SidebarFooter />
    </aside>
  );
}
