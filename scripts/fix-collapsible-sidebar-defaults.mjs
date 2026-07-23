import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/layout/sidebar-nav.tsx";
let source = readFileSync(path, "utf8");
source = source.replace(
  '      if (section.label === "總覽" || section.label === "管理者工作區" || sectionContainsCurrentPath(section)) {',
  '      if (sectionContainsCurrentPath(section)) {',
);
writeFileSync(path, source);
console.log("Sidebar default-open behavior corrected.");
