import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createShiftOpeningCashJournal } from "../src/lib/pos-shift-accounting";
import { getPosDailySummary, getPosShiftCashPosition } from "../src/lib/pos-daily-summary";

function fakeJournalTx() {
  const journals: any[] = [];
  return {
    journals,
    tx: {
      $executeRaw: async () => 1,
      accountingPeriod: { findUnique: async () => null },
      chartOfAccount: {
        findMany: async () => [
          { id: "cash", code: "1101", name: "庫存現金" },
          { id: "petty", code: "1102", name: "零用金" },
        ],
      },
      numberSequence: {
        upsert: async () => ({ prefix: "JE", format: "{roc}{mm}{dd}{seq:0000}", nextNo: 2 }),
      },
      journalEntry: {
        findFirst: async () => ({ id: "opening-journal" }),
        create: async ({ data, select }: any) => {
          journals.push(data);
          assert.deepEqual(select, { id: true, number: true });
          return { id: `journal-${journals.length}`, number: data.number };
        },
      },
    },
  };
}

async function main() {
const opened = fakeJournalTx();
await createShiftOpeningCashJournal(opened.tx as any, {
  tenantId: "tenant",
  userId: "user",
  shiftId: "shift",
  registerCode: "POS01",
  openingCash: 3_000,
  direction: "OPEN",
  entryDate: new Date("2026-07-24T01:00:00.000Z"),
});
assert.equal(opened.journals.length, 1);
assert.equal(opened.journals[0].status, "POSTED");
assert.deepEqual(opened.journals[0].lines.create.map((line: any) => ({
  accountId: line.accountId,
  debit: line.debit,
  credit: line.credit,
})), [
  { accountId: "cash", debit: 3_000, credit: 0 },
  { accountId: "petty", debit: 0, credit: 3_000 },
]);

const closed = fakeJournalTx();
await createShiftOpeningCashJournal(closed.tx as any, {
  tenantId: "tenant",
  userId: "user",
  shiftId: "shift",
  registerCode: "POS01",
  openingCash: 3_000,
  direction: "CLOSE",
});
assert.deepEqual(closed.journals[0].lines.create.map((line: any) => ({
  accountId: line.accountId,
  debit: line.debit,
  credit: line.credit,
})), [
  { accountId: "petty", debit: 3_000, credit: 0 },
  { accountId: "cash", debit: 0, credit: 3_000 },
]);

const legacyShift = fakeJournalTx();
legacyShift.tx.journalEntry.findFirst = async () => null;
assert.equal(await createShiftOpeningCashJournal(legacyShift.tx as any, {
  tenantId: "tenant",
  userId: "user",
  shiftId: "legacy-shift",
  registerCode: "POS01",
  openingCash: 3_000,
  direction: "CLOSE",
}), null);
assert.equal(legacyShift.journals.length, 0);

const zero = fakeJournalTx();
assert.equal(await createShiftOpeningCashJournal(zero.tx as any, {
  tenantId: "tenant",
  userId: "user",
  shiftId: "shift",
  registerCode: "POS01",
  openingCash: 0,
  direction: "OPEN",
}), null);
assert.equal(zero.journals.length, 0);

const daily = await getPosDailySummary("tenant", {
  posSale: { aggregate: async () => ({ _sum: { total: 10_000 }, _count: { _all: 4 } }) },
  posRefund: { aggregate: async () => ({ _sum: { total: 1_200 }, _count: { _all: 1 } }) },
  posSaleItem: { aggregate: async () => ({ _sum: { quantity: 12 } }) },
  posRefundItem: { aggregate: async () => ({ _sum: { quantity: 2 } }) },
});
assert.deepEqual(daily, {
  sales: 4,
  refunds: 1,
  grossAmount: 10_000,
  refundAmount: 1_200,
  amount: 8_800,
  soldQuantity: 12,
  refundedQuantity: 2,
  netQuantity: 10,
});

const cash = await getPosShiftCashPosition({ id: "shift", openingCash: 3_000 }, {
  posPayment: { aggregate: async () => ({ _sum: { amount: 8_000 } }) },
  posRefundPayment: { aggregate: async () => ({ _sum: { amount: 500 } }) },
  posCashMovement: {
    groupBy: async () => [
      { type: "PAID_IN", _sum: { amount: 200 } },
      { type: "PAID_OUT", _sum: { amount: 100 } },
      { type: "SAFE_DROP", _sum: { amount: 2_000 } },
    ],
  },
});
assert.equal(cash?.expectedCash, 8_600);

const shiftRoute = readFileSync("src/app/api/pos/shifts/route.ts", "utf8");
assert.match(shiftRoute, /direction: "OPEN"/);
assert.match(shiftRoute, /direction: "CLOSE"/);
assert.match(shiftRoute, /零用金轉回傳票/);

const retail = readFileSync("src/app/(app)/pos/pos-workspace.tsx", "utf8");
const restaurant = readFileSync("src/app/(app)/pos/restaurant/restaurant-workspace.tsx", "utf8");
const dashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
const workspace = readFileSync("src/app/(app)/workspace/page.tsx", "utf8");
assert.match(retail, /今日淨售出件數/);
assert.match(retail, /開店零用金（會計入帳）/);
assert.match(restaurant, /今日淨售出份數/);
assert.match(restaurant, /確認結班並轉回零用金/);
assert.match(dashboard, /今日官網營業額/);
assert.match(dashboard, /今日官網訂單/);
assert.match(dashboard, /今日售出件數/);
assert.match(workspace, /今日官網營業額/);
assert.match(workspace, /線上付款沒有實體錢櫃，不建立零用金傳票/);

console.log("POS opening cash journals and daily channel statistics: PASS");
}

void main();
