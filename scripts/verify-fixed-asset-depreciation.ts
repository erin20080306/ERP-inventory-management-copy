import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeSuggestedDepreciation,
  depreciationPeriod,
  parseDepreciationDate,
  preferredAccumulatedAccountCode,
} from "../src/lib/fixed-asset-depreciation";

const base = {
  acquireCost: 120_000,
  residualValue: 0,
  usefulLifeMonths: 60,
  accumulatedDepreciation: 0,
  bookValue: 120_000,
  accountCode: "1421",
  category: "機器設備",
} as const;

assert.deepEqual(computeSuggestedDepreciation({ ...base, method: "STRAIGHT_LINE" }, 0), {
  amount: 2_000,
  remaining: 120_000,
  openingBookValue: 120_000,
  closingBookValue: 118_000,
});
assert.equal(computeSuggestedDepreciation({ ...base, method: "DOUBLE_DECLINING" }, 0).amount, 4_000);
assert.equal(computeSuggestedDepreciation({ ...base, method: "SUM_OF_YEARS" }, 0).amount, 3_934.43);
assert.equal(computeSuggestedDepreciation({
  ...base,
  method: "STRAIGHT_LINE",
  residualValue: 1_000,
  bookValue: 1_500,
  accumulatedDepreciation: 118_500,
}, 59).amount, 500);
assert.equal(computeSuggestedDepreciation({ ...base, method: "NONE" }, 0).amount, 0);
assert.equal(depreciationPeriod(new Date("2026-07-31T15:59:59.000Z")), "2026-07");
assert.equal(depreciationPeriod(new Date("2026-07-31T16:00:00.000Z")), "2026-08");
assert.equal(parseDepreciationDate("2026-07-31").toISOString(), "2026-07-31T04:00:00.000Z");
assert.throws(() => parseDepreciationDate("2026-02-31"), /有效的日曆日期/);
assert.equal(preferredAccumulatedAccountCode({ accountCode: "1411", category: "房屋及建築" }), "1451");
assert.equal(preferredAccumulatedAccountCode({ accountCode: "1442", category: "電腦設備" }), "1455");
assert.equal(preferredAccumulatedAccountCode({ accountCode: null, category: "運輸設備" }), "1453");

const api = readFileSync("src/app/api/accounting/fixed-assets/depreciation/route.ts", "utf8");
const assetApi = readFileSync("src/app/api/accounting/fixed-assets/[id]/route.ts", "utf8");
const journalApi = readFileSync("src/app/api/accounting/journals/[id]/route.ts", "utf8");
const client = readFileSync("src/app/(app)/accounting/fixed-assets/client.tsx", "utf8");
const balanceSheet = readFileSync("src/app/print/balance-sheet/page.tsx", "utf8");

assert.match(api, /pg_advisory_xact_lock/);
assert.match(api, /lockAndAssertAccountingPeriodOpen/);
assert.match(api, /createPostedJournal/);
assert.match(api, /status: "CONFIRMED"/);
assert.match(api, /status: "POSTED"/);
assert.match(api, /已有較後期的/);
assert.match(assetApi, /請使用折舊確認流程/);
assert.match(assetApi, /已有折舊子帳，不可刪除/);
assert.match(journalApi, /fixedAssetDepreciation/);
assert.match(journalApi, /laterDepreciation/);
assert.match(journalApi, /只回復本次沖銷的金額/);
assert.doesNotMatch(journalApi, /activeDepreciation\._sum\.amount/);
assert.match(client, /是否立即切製並過帳傳票/);
assert.match(client, /固定資產折舊表/);
assert.match(balanceSheet, /a\.code\.startsWith\("14"\)/);

console.log("Fixed-asset depreciation preview, subledger, posting, reversal and financial-statement safeguards: PASS");
