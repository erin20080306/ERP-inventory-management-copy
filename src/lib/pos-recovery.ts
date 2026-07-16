import type { PosCartPayload } from "./pos-cart";

export type LocalPosDraft = {
  version: 1;
  shiftId: string;
  savedAt: string;
  serverRevision: number;
  checkoutRequestId: string;
  payload: PosCartPayload;
};

export type ServerPosDraft = {
  payload: PosCartPayload;
  revision: number;
  updatedAt: string | Date;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function posDraftStorageKey(shiftId: string) {
  return `erin-erp:pos-draft:v1:${shiftId}`;
}

export function readLocalPosDraft(storage: StorageLike, shiftId: string): LocalPosDraft | null {
  try {
    const parsed = JSON.parse(storage.getItem(posDraftStorageKey(shiftId)) || "null") as LocalPosDraft | null;
    if (!parsed || parsed.version !== 1 || parsed.shiftId !== shiftId || !parsed.payload || !Array.isArray(parsed.payload.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalPosDraft(storage: StorageLike, draft: LocalPosDraft) {
  storage.setItem(posDraftStorageKey(draft.shiftId), JSON.stringify(draft));
}

export function clearLocalPosDraft(storage: StorageLike, shiftId: string) {
  storage.removeItem(posDraftStorageKey(shiftId));
}

export function choosePosRecoveryDraft(server: ServerPosDraft | null, local: LocalPosDraft | null) {
  if (!server && !local) return null;
  if (!server) return { source: "LOCAL" as const, conflict: false, payload: local!.payload, updatedAt: local!.savedAt, checkoutRequestId: local!.checkoutRequestId, serverDraft: null };
  if (!local) return { source: "SERVER" as const, conflict: false, payload: server.payload, updatedAt: new Date(server.updatedAt).toISOString(), checkoutRequestId: "", serverDraft: server };

  const samePayload = JSON.stringify(server.payload) === JSON.stringify(local.payload);
  if (samePayload) {
    return { source: "SERVER" as const, conflict: false, payload: server.payload, updatedAt: new Date(server.updatedAt).toISOString(), checkoutRequestId: local.checkoutRequestId, serverDraft: server };
  }
  if (local.serverRevision === server.revision) {
    return { source: "LOCAL" as const, conflict: false, payload: local.payload, updatedAt: local.savedAt, checkoutRequestId: local.checkoutRequestId, serverDraft: server };
  }
  return { source: "LOCAL" as const, conflict: true, payload: local.payload, updatedAt: local.savedAt, checkoutRequestId: local.checkoutRequestId, serverDraft: server };
}
