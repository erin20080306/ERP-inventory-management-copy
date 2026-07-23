import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar = readFileSync("src/components/layout/sidebar-nav.tsx", "utf8");

assert.match(sidebar, /useState<Record<string, boolean>>/);
assert.match(sidebar, /erin-sidebar-sections:/);
assert.match(sidebar, /aria-expanded=\{expanded\}/);
assert.match(sidebar, /全部展開/);
assert.match(sidebar, /全部收合/);
assert.match(sidebar, /sectionContainsCurrentPath/);
assert.match(sidebar, /管理者工作區/);
assert.match(sidebar, /ChevronDown/);
assert.match(sidebar, /localStorage\.setItem\(sidebarStorageKey/);
assert.doesNotMatch(sidebar, /saved\[section\.label\] \?\? section\.label === "總覽" \?\?/);

console.log("Admin and tenant collapsible sidebar: PASS");
