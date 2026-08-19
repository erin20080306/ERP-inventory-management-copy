import { estimateDailyDemand, groupSuggestionsBySupplier, type ReorderSuggestion } from "../src/lib/reorder-forecast";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

// 穩定需求：30 天賣 60 → 日均 2；近 7 天賣 14 → 日均 2，無趨勢，取整體 2
eq("stable demand → 2/day", estimateDailyDemand(60, 30, 14, 7), 2);

// 上升趨勢：30 天賣 30（1/天），近 7 天賣 21（3/天）＞1.2 倍 → 取平均 (1+3)/2 = 2
eq("accelerating demand → blended 2/day", estimateDailyDemand(30, 30, 21, 7), 2);

// 無銷售 → 0
eq("no sales → 0/day", estimateDailyDemand(0, 30, 0, 7), 0);

// 分組：兩供應商，依預估金額由大到小
const base = {
  sku: "",
  name: "",
  spec: null,
  onHand: 0,
  onOrder: 0,
  avgDailyDemand: 1,
  demandWindowDays: 30,
  daysOfCover: null,
  leadTimeDays: 7,
  leadTimeSource: "default" as const,
  safetyStock: 0,
  reorderPoint: 0,
  targetLevel: 0,
  costPrice: 10,
  supplierSource: "history" as const,
  urgency: "warning" as const,
  reason: "",
};
const suggestions: ReorderSuggestion[] = [
  { ...base, productId: "p1", supplierId: "s1", supplierName: "A", suggestedQty: 5, estimatedCost: 50 },
  { ...base, productId: "p2", supplierId: "s2", supplierName: "B", suggestedQty: 20, estimatedCost: 200 },
  { ...base, productId: "p3", supplierId: "s1", supplierName: "A", suggestedQty: 3, estimatedCost: 30 },
  { ...base, productId: "p4", supplierId: null, supplierName: "無", suggestedQty: 9, estimatedCost: 90 },
];
const groups = groupSuggestionsBySupplier(suggestions);
eq("group count (null supplier excluded)", groups.length, 2);
eq("sorted by estimatedCost desc → B first", groups[0].supplierId, "s2");
eq("supplier A merged 2 items", groups[1].items.length, 2);
eq("supplier A total qty", groups[1].totalQty, 8);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
