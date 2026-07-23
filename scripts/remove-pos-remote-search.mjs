import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/(app)/pos/pos-workspace.tsx";
let source = readFileSync(path, "utf8");
const needle = 'if (query.trim()) params.set("q", query.trim());';
const queryIndex = source.indexOf(needle);

if (queryIndex >= 0) {
  const start = source.lastIndexOf("  useEffect(() => {", queryIndex);
  const end = source.indexOf("  useEffect(() => {", queryIndex + needle.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("找不到 POS 遠端商品搜尋 effect 的完整邊界");
  }
  source = `${source.slice(0, start)}${source.slice(end)}`;
  writeFileSync(path, source);
  console.log("POS remote product search effect removed; local filtering remains active.");
} else {
  console.log("POS remote product search effect already removed.");
}
