import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar = readFileSync("src/components/layout/sidebar.tsx", "utf8");
const nav = readFileSync("src/components/layout/sidebar-nav.tsx", "utf8");

assert.match(sidebar, /erin-sidebar-collapsed/);
assert.match(sidebar, /collapsed \? "w-20" : "w-64"/);
assert.match(sidebar, /SidebarBrand collapsed=\{collapsed\}/);
assert.match(sidebar, /SidebarNav collapsed=\{collapsed\}/);
assert.match(sidebar, /向左收合選單/);
assert.match(nav, /collapsed \|\| expanded/);
assert.match(nav, /title=\{collapsed \? i\.title : undefined\}/);
assert.match(nav, /!collapsed && \(\s*<div className="mb-2/);
assert.match(nav, /全部展開/);
assert.match(nav, /aria-expanded=\{expanded\}/);
assert.match(nav, /SidebarFooter\(\{ collapsed = false \}/);

console.log("Section accordions preserved and whole sidebar left-collapse rail: PASS");
