import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const numbers = readFileSync("src/lib/number-sequence.ts", "utf8");
const checkout = readFileSync("src/app/api/pos/checkout/route.ts", "utf8");
const offers = readFileSync("src/lib/pos-offers.ts", "utf8");
const workspace = readFileSync("src/app/(app)/workspace/page.tsx", "utf8");
const access = readFileSync("src/lib/storefront-access.ts", "utf8");
const storePage = readFileSync("src/app/store/[tenant]/[[...view]]/page.tsx", "utf8");
const storeUi = readFileSync("src/app/store/[tenant]/[[...view]]/storefront.tsx", "utf8");
const admin = readFileSync("src/app/admin/page.tsx", "utf8");

function check(name, condition) {
  if (!condition) throw new Error(`檢查失敗：${name}`);
  console.log(`PASS: ${name}`);
}

check("SO/RP/POS/JE 批次單號", numbers.includes("nextNumbersFastInTransaction") && numbers.includes("Prisma.join(uniqueKeys"));
check("結帳預查平行化", checkout.includes("const [priorSale, shift, products, preloadedPromotions, walkInCustomerId] = await Promise.all(["));
check("結帳使用批次單號", checkout.includes('["SO", "RP", "POS", "JE"]'));
check("散客資料快取", checkout.includes("walkInCustomerIdCache") && checkout.includes("walkInCustomerId!"));
check("促銷預載", offers.includes("promotions?: any[];") && checkout.includes("promotions: eligiblePromotions"));
check("銷售與收款單張傳票", checkout.includes("POS 即時銷售與收款") && !checkout.includes("createCheckoutJournals"));
check("餐桌單次完成更新", checkout.includes("WITH completed AS") && checkout.includes('UPDATE "RestaurantTable"'));
check("電商租戶不再略過工作區", !workspace.includes('mode === "ERP" || mode === "ECOMMERCE"'));
check("電商 ERP 工作區卡片", workspace.includes("進入 ERP 營運後台"));
check("電商租戶 ERP 權限", access.includes("canAccessTenantErp"));
check("商城管理切換 ERP", storePage.includes("managerErpHref") && storeUi.includes("切換 ERP"));
check("平台後台工作區切換", admin.includes("切換 ERP／電商工作區"));

console.log("POS checkout v3 and ecommerce ERP switching safeguards: PASS");
