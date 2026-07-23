import { readFileSync, writeFileSync } from "node:fs";

const path = "src/lib/pos-offers.ts";
let source = readFileSync(path, "utf8");

if (!source.includes("promotions?: any[];")) {
  const search = "  redeemPoints?: number;\n}) {";
  const replacement = "  redeemPoints?: number;\n  promotions?: any[];\n}) {";
  if (!source.includes(search)) throw new Error("找不到預載促銷參數定位點");
  source = source.replace(search, replacement);
}

const oldQuery = `  const promotions = await tx.posPromotion.findMany({
    where: { tenantId: input.tenantId, ...activeWindow, minSpend: { lte: input.baseTotal } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });`;
const newQuery = `  const promotions = (input.promotions ?? await tx.posPromotion.findMany({
    where: { tenantId: input.tenantId, ...activeWindow, minSpend: { lte: input.baseTotal } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  })).filter((item: any) => Number(item.minSpend) <= input.baseTotal);`;
if (!source.includes(newQuery)) {
  if (!source.includes(oldQuery)) throw new Error("找不到促銷查詢定位點");
  source = source.replace(oldQuery, newQuery);
}

writeFileSync(path, source);
console.log("POS promotion prefetch patch applied.");
