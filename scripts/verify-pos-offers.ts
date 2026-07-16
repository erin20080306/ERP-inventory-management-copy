import assert from "node:assert/strict";
import { discountApprovalFingerprint, offerDiscount } from "../src/lib/pos-offers";

assert.equal(offerDiscount({ kind: "PERCENT", value: 10 }, 999), 99.9);
assert.equal(offerDiscount({ kind: "AMOUNT", value: 200 }, 100), 100);
assert.equal(offerDiscount({ kind: "PERCENT", value: 20, maxDiscount: 50 }, 500), 50);

const a = discountApprovalFingerprint({ shiftId: "S1", items: [{ productId: "P2", quantity: 2, discount: 5 }, { productId: "P1", quantity: 1, discount: 10 }] });
const b = discountApprovalFingerprint({ shiftId: "S1", items: [{ productId: "P1", quantity: 1, discount: 10 }, { productId: "P2", quantity: 2, discount: 5 }] });
const changed = discountApprovalFingerprint({ shiftId: "S1", items: [{ productId: "P1", quantity: 1, discount: 11 }, { productId: "P2", quantity: 2, discount: 5 }] });
assert.equal(a, b, "折扣核准指紋不應受購物車排序影響");
assert.notEqual(a, changed, "折扣金額變更後必須使主管核准失效");

console.log("POS offer checks passed: percentage/fixed caps and manager-approval cart binding.");
