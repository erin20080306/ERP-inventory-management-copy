import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/layout/sidebar-nav.tsx";
let source = readFileSync(path, "utf8");

source = source.replace(
  'import { useCallback, useEffect } from "react";',
  'import { useCallback, useEffect, useState } from "react";',
);
source = source.replace(
  'ShoppingBag, Store, ScanBarcode, Cable, FileCheck2, UtensilsCrossed, ChefHat, PanelsTopLeft,',
  'ShoppingBag, Store, ScanBarcode, Cable, FileCheck2, UtensilsCrossed, ChefHat, PanelsTopLeft, ChevronDown,',
);

const sectionsBlock = `  const sections = data?.user?.isSuperAdmin
    ? adminSections
    : businessMode === "ECOMMERCE"
      ? [erpSections[0], ecommerceFront, ...posBackendSections]
      : businessMode === "POS_RESTAURANT"
        ? [erpSections[0], restaurantPosFront, ...posBackendSections]
        : businessMode === "POS_RETAIL"
          ? [erpSections[0], retailPosFront, ...posBackendSections]
          : erpSections;
`;

const stateBlock = `${sectionsBlock}
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const sectionLabelsKey = sections.map((section) => section.label).join("|");
  const sidebarStorageKey = \`erin-sidebar-sections:\${data?.user?.id ?? "anonymous"}:\${data?.user?.isSuperAdmin ? "admin" : businessMode}\`;

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
      saved[section.label] ?? section.label === "總覽" ?? false,
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
`;

if (!source.includes("const [openSections")) {
  if (!source.includes(sectionsBlock)) throw new Error("找不到側欄 sections 定位點");
  source = source.replace(sectionsBlock, stateBlock);
}

const oldRender = `  return (
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
  );`;

const newRender = `  return (
    <nav className="flex-1 overflow-y-auto py-3">
      <div className="mb-2 flex items-center justify-end gap-1 px-3">
        <button type="button" onClick={() => updateAllSections(true)} className="rounded px-2 py-1 text-[10px] text-white/45 hover:bg-white/5 hover:text-white/80">全部展開</button>
        <button type="button" onClick={() => updateAllSections(false)} className="rounded px-2 py-1 text-[10px] text-white/45 hover:bg-white/5 hover:text-white/80">全部收合</button>
      </div>
      {sections.map((s, sectionIndex) => {
        const visible = s.items.filter((i) => !i.perm || hasPermission(perms, i.perm));
        if (visible.length === 0) return null;
        const containsActiveItem = visible.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
        const expanded = openSections[s.label] ?? s.label === "總覽" || s.label === "管理者工作區" || containsActiveItem;
        const regionId = \`sidebar-section-\${sectionIndex}\`;
        return (
          <div key={s.label} className="mb-1.5 px-2">
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
            {expanded && (
              <ul id={regionId} className="mt-1 space-y-0.5 px-1">
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
            )}
          </div>
        );
      })}
    </nav>
  );`;

if (!source.includes("全部收合")) {
  if (!source.includes(oldRender)) throw new Error("找不到側欄 render 定位點");
  source = source.replace(oldRender, newRender);
}

// Fix operator precedence and avoid the generated nullish/boolean mix syntax.
source = source.replace(
  '      saved[section.label] ?? section.label === "總覽" ?? false,',
  '      saved[section.label] ?? (section.label === "總覽" || section.label === "管理者工作區" || sectionContainsCurrentPath(section)),',
);
source = source.replace(
  '        const expanded = openSections[s.label] ?? s.label === "總覽" || s.label === "管理者工作區" || containsActiveItem;',
  '        const expanded = openSections[s.label] ?? (s.label === "總覽" || s.label === "管理者工作區" || containsActiveItem);',
);

writeFileSync(path, source);
console.log("Collapsible sidebar patch applied.");
