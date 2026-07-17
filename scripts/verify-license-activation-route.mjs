import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/admin/license-activation/page.tsx", "utf8");
const layout = readFileSync("src/app/admin/layout.tsx", "utf8");

assert.match(page, /force-dynamic/);
assert.match(page, /force-no-store/);
assert.match(page, /最新開通流程 2026\.07\.17-3/);
assert.match(layout, /\/admin\/license-activation\?release=20260717-3/);
assert.match(layout, /方案開通／啟用碼/);

console.log("License activation route: PASS");
