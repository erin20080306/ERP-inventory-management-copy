import assert from "node:assert/strict";
import {
  choosePosRecoveryDraft,
  clearLocalPosDraft,
  posDraftStorageKey,
  readLocalPosDraft,
  writeLocalPosDraft,
  type LocalPosDraft,
} from "../src/lib/pos-recovery";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const payload = {
  version: 1 as const,
  items: [{ product: { id: "product-1", sku: "P001", name: "測試商品", salePrice: 100, stockTotal: 5 }, quantity: 1, discount: 0 }],
  customerId: null,
};
const changedPayload = { ...payload, items: [{ ...payload.items[0], quantity: 2 }] };
const local: LocalPosDraft = {
  version: 1,
  shiftId: "shift-1",
  savedAt: "2026-07-16T12:00:00.000Z",
  serverRevision: 2,
  checkoutRequestId: "checkout-request-123456",
  payload: changedPayload,
};

const storage = new MemoryStorage();
assert.equal(readLocalPosDraft(storage, "shift-1"), null);
writeLocalPosDraft(storage, local);
assert.deepEqual(readLocalPosDraft(storage, "shift-1"), local);
assert.equal(readLocalPosDraft(storage, "another-shift"), null);

const server = { payload, revision: 2, updatedAt: "2026-07-16T11:59:00.000Z" };
const localNewer = choosePosRecoveryDraft(server, local);
assert.equal(localNewer?.source, "LOCAL");
assert.equal(localNewer?.conflict, false);
assert.equal(localNewer?.checkoutRequestId, local.checkoutRequestId);

const conflict = choosePosRecoveryDraft({ ...server, revision: 3 }, local);
assert.equal(conflict?.source, "LOCAL");
assert.equal(conflict?.conflict, true);
assert.equal(conflict?.serverDraft?.revision, 3);

const matchingLocal = { ...local, payload, serverRevision: 2 };
const matching = choosePosRecoveryDraft(server, matchingLocal);
assert.equal(matching?.source, "SERVER");
assert.equal(matching?.conflict, false);

assert.equal(choosePosRecoveryDraft(null, local)?.source, "LOCAL");
assert.equal(choosePosRecoveryDraft(server, null)?.source, "SERVER");
assert.equal(choosePosRecoveryDraft(null, null), null);

storage.setItem(posDraftStorageKey("broken"), "{not-json");
assert.equal(readLocalPosDraft(storage, "broken"), null);
clearLocalPosDraft(storage, "shift-1");
assert.equal(readLocalPosDraft(storage, "shift-1"), null);

console.log("POS local recovery, checkout request preservation, and draft conflict selection: PASS");
