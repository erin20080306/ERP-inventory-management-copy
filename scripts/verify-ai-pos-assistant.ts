import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAssistantPermissionCode } from "../src/lib/ai-assistant";
import { buildPosOperationsReport, isPosAssistantQuestion, parsePosAssistantPeriod } from "../src/lib/ai-assistant-pos";
import { prisma } from "../src/lib/prisma";
import { assertTestDatabase } from "./assert-test-database";

assertTestDatabase(/^erp_pos_test_[a-z0-9_]+$/, "erp_pos_test_*");

const examples = [
  "今日 POS 營業額",
  "目前誰開班",
  "總帳庫存現金",
  "待核准錢櫃異動",
  "今日熱賣商品",
  "客戶消費排行",
  "餐飲未結帳桌位",
  "廚房出餐時間",
  "現金短溢",
  "退款最多商品",
];

for (const question of examples) {
  assert.equal(isPosAssistantQuestion(question), true, `應識別 POS 問句：${question}`);
  assert.equal(getAssistantPermissionCode(question), "pos.view");
}
assert.equal(isPosAssistantQuestion("產品毛利銷售排行"), false, "原 ERP 毛利排行不可誤分流為 POS");

const today = parsePosAssistantPeriod("今日營業額", new Date("2026-07-24T03:00:00.000Z"));
assert.equal(today.label, "今日");
assert.equal(today.from.toISOString(), "2026-07-23T16:00:00.000Z");
assert.equal(today.to.toISOString(), "2026-07-24T15:59:59.999Z");

const yesterday = parsePosAssistantPeriod("昨日餐飲營業額", new Date("2026-07-24T03:00:00.000Z"));
assert.equal(yesterday.from.toISOString(), "2026-07-22T16:00:00.000Z");
assert.equal(yesterday.to.toISOString(), "2026-07-23T15:59:59.999Z");

const posAssistant = readFileSync("src/lib/ai-assistant-pos.ts", "utf8");
const assistantUi = readFileSync("src/components/ai-assistant.tsx", "utf8");
const restaurantUi = readFileSync("src/app/(app)/pos/restaurant/restaurant-workspace.tsx", "utf8");
const restaurantApi = readFileSync("src/app/api/pos/restaurant/route.ts", "utf8");

assert.match(posAssistant, /開班人員/);
assert.match(posAssistant, /結班人員/);
assert.match(posAssistant, /總帳庫存現金/);
assert.match(posAssistant, /POS 客戶消費排行/);
assert.match(posAssistant, /POS 商品／餐點排行/);
assert.match(posAssistant, /廚房出餐時間/);
assert.match(posAssistant, /平均總出餐時間/);
assert.match(assistantUi, /待核准錢櫃異動/);
assert.match(restaurantUi, /role="status"/);
assert.match(restaurantUi, /開始製作/);
assert.match(restaurantUi, /確認已出餐/);
assert.match(restaurantUi, /目前總耗時/);
assert.match(restaurantApi, /startedAt: ticket\?\.startedAt/);
assert.match(restaurantApi, /servedAt: ticket\?\.servedAt/);
assert.match(restaurantApi, /restaurant_item_status/);

async function verifyRuntimeReport() {
  const tenant = await prisma.tenant.create({
    data: { name: "AI POS 報表執行測試", businessMode: "POS" },
    select: { id: true },
  });
  const report = await buildPosOperationsReport(tenant.id, "今日 POS 營業額、庫存現金與廚房出餐時間");
  assert.equal(report.kind, "pos-operations");
  assert(report.cards.some((card) => card.label === "總帳庫存現金"));
  assert(report.tables.some((table) => table.title === "廚房出餐時間"));
}

verifyRuntimeReport()
  .then(() => console.log("AI POS keywords, kitchen timing, visible status feedback, and runtime report: PASS"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
