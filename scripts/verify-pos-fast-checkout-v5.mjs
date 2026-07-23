import { readFileSync } from "node:fs";

const checkout = readFileSync("src/app/api/pos/checkout/route.ts", "utf8");
const fulfillment = readFileSync("src/lib/pos-fulfillment.ts", "utf8");
const retail = readFileSync("src/app/(app)/pos/pos-workspace.tsx", "utf8");
const restaurant = readFileSync("src/app/(app)/pos/restaurant/restaurant-workspace.tsx", "utf8");
const workspace = readFileSync("src/app/(app)/workspace/page.tsx", "utf8");
const access = readFileSync("src/lib/storefront-access.ts", "utf8");

function check(name, condition) {
  if (!condition) throw new Error(`檢查失敗：${name}`);
  console.log(`PASS: ${name}`);
}

check("前台只配置 POS 單號", checkout.includes('nextNumberFastInTransaction(tx, "POS"') && !checkout.includes('["SO", "RP", "POS", "JE"]'));
check("前台不再建立 ERP 銷售訂單", !checkout.includes("tx.salesOrder.create") && !checkout.includes("createCheckoutJournal"));
check("庫存數量仍先快速扣減", checkout.includes("decrementCheckoutStocks(tx"));
check("回應後背景同步", checkout.includes("fulfillPosSale(result.sale.id)") && checkout.includes('erpSync: "QUEUED"'));
check("背景履約可重試", fulfillment.includes("drainPendingPosSales") && fulfillment.includes("pg_advisory_xact_lock") && fulfillment.includes("salesOrderId: null"));
check("背景建立進銷存與帳務", fulfillment.includes("salesOrder.create") && fulfillment.includes("accountsReceivable.create") && fulfillment.includes("inventoryTransaction.createMany") && fulfillment.includes("journalEntry.create"));
check("一般 POS 不等待草稿", retail.includes("const pendingDraftSave") && !retail.includes("await draftSaveQueueRef.current;"));
check("一般 POS 刷卡需授權碼", retail.includes("請先完成刷卡機交易") && retail.includes("刷卡授權碼／卡號末四碼（必填）"));
check("餐飲現金輸入與找零", restaurant.includes("實收現金") && restaurant.includes("確認收現並完成結帳") && restaurant.includes("找零"));
check("餐飲刷卡核准流程", restaurant.includes("刷卡機已顯示核准") && restaurant.includes("確認刷卡核准並完成結帳"));
check("餐飲點餐即時佇列", restaurant.includes("addQueueRef") && restaurant.includes("flushAddQueue") && restaurant.includes("blocking = true"));
check("電商 ERP 工作區仍保留", workspace.includes("進入 ERP 營運後台") && access.includes("canAccessTenantErp"));

console.log("POS fast checkout v5 safeguards: PASS");
