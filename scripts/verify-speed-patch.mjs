import { readFileSync } from "node:fs";

const pos = readFileSync("src/app/(app)/pos/pos-workspace.tsx", "utf8");
const restaurant = readFileSync("src/app/(app)/pos/restaurant/restaurant-workspace.tsx", "utf8");
const posProducts = readFileSync("src/app/api/pos/products/route.ts", "utf8");
const storefront = readFileSync("src/app/api/store/[tenant]/route.ts", "utf8");

function check(name, condition) {
  if (!condition) throw new Error(`速度防護失敗：${name}`);
  console.log(`PASS: ${name}`);
}

check("POS 商品 sessionStorage 快取", pos.includes("POS_PRODUCT_CACHE_TTL_MS = 60_000") && pos.includes("readCachedPosProducts"));
check("POS 商品搜尋不再每次呼叫 API", !pos.includes('if (query.trim()) params.set("q", query.trim());'));
check("POS 停電草稿改為 3 秒背景同步", pos.includes("}, 3_000);"));
check("餐飲 POS 15 秒啟動畫面快取", restaurant.includes("RESTAURANT_BOOTSTRAP_CACHE_TTL_MS = 15_000"));
check("餐飲結帳先局部清桌再背景校正", restaurant.includes("window.setTimeout(() => void load(), 1_200);"));
check("POS 初始商品可載入最多 500 筆供本機搜尋", posProducts.includes("take: query ? 80 : 500"));
check("商城庫存使用單次批次 SQL 更新", storefront.includes("Prisma.join(requestedRows)") && !storefront.includes("for (const allocation of stockPlan.allocations)"));

console.log("Runtime speed optimization safeguards: PASS");
