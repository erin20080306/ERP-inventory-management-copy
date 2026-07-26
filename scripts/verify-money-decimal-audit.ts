import assert from "node:assert/strict";
import { calcTotals } from "../src/lib/documents";
import {
  auditDocumentTotalsDecimal,
  calculateDocumentTotalsDecimal,
  compareMoneySnapshots,
} from "../src/lib/money-audit";

process.env.MONEY_DECIMAL_AUDIT = "false";

const items = [
  { productId: "p1", quantity: 3, unitPrice: 19.9, discount: 1, taxRate: 0.05 },
  { productId: "p2", quantity: 1.25, unitPrice: 88.8, discount: 0, taxRate: 0.05 },
  { productId: "p3", quantity: 0.3333, unitPrice: 123.4567, discount: 2, taxRate: 0.05 },
];

const legacy = calcTotals(items, true);
const precise = calculateDocumentTotalsDecimal(items, true);
const audit = auditDocumentTotalsDecimal("test.document", items, true, legacy, { itemCount: items.length });

assert.deepEqual(
  { subtotal: legacy.subtotal, discount: legacy.discount, taxAmount: legacy.taxAmount, total: legacy.total },
  { subtotal: precise.subtotal, discount: precise.discount, taxAmount: precise.taxAmount, total: precise.total },
);
assert.equal(audit.matched, true);

// 稽核器必須能發現差異，但不得替換舊計算結果。
const mismatch = compareMoneySnapshots(
  "test.intentional-mismatch",
  { subtotal: 100, discount: 0, taxAmount: 5, total: 105 },
  { subtotal: 100, discount: 0, taxAmount: 6, total: 106 },
);
assert.equal(mismatch.matched, false);
assert.deepEqual(mismatch.differences.map((row) => row.field), ["taxAmount", "total"]);
assert.equal(legacy.total, calcTotals(items, true).total);

console.log("Decimal shadow calculation preserves legacy totals and detects precision differences: PASS");
