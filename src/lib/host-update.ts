import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyOfflineLease, type SignedOfflineLease } from "./license";

export type HostUpdateState = {
  state: "idle" | "queued" | "pulling" | "restarting" | "healthy" | "current" | "rolling_back" | "rolled_back" | "failed";
  message: string;
  fromVersion?: string;
  toVersion?: string;
  updatedAt: string;
};

export type HostRelease = {
  version: string;
  image: string;
  publishedAt: string;
};

const VERSION_PATTERN = /^(?:[a-f0-9]{7,64}|development)$/i;
const IMAGE = "ghcr.io/erin20080306/erp-inventory-management-copy:latest";

export function currentHostVersion() {
  const value = String(process.env.ERIN_RELEASE_SHA || "development").trim();
  return VERSION_PATTERN.test(value) ? value : "development";
}

export function shortHostVersion(value: string | null | undefined) {
  if (!value) return "—";
  return /^[a-f0-9]{12,}$/i.test(value) ? value.slice(0, 12) : value;
}

function stateDirectory() {
  return process.env.UPDATE_STATE_DIR || "/update-state";
}

function validState(value: unknown): value is HostUpdateState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.state === "string" && typeof row.message === "string" && typeof row.updatedAt === "string";
}

export async function readHostUpdateState(): Promise<HostUpdateState> {
  try {
    const parsed = JSON.parse(await readFile(path.join(stateDirectory(), "status.json"), "utf8"));
    if (validState(parsed)) return parsed;
  } catch {}
  return { state: "idle", message: "尚未執行更新", updatedAt: new Date(0).toISOString() };
}

export async function writeHostUpdateState(state: HostUpdateState) {
  const target = path.join(stateDirectory(), "status.json");
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temporary, target);
}

export async function fetchCurrentHostRelease(): Promise<HostRelease> {
  const central = process.env.CENTRAL_LICENSE_URL?.replace(/\/$/, "");
  if (!central) throw new Error("尚未設定中央版本服務");
  const response = await fetch(`${central}/api/releases/current`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const result = await response.json().catch(() => null) as { release?: SignedOfflineLease; error?: string } | null;
  if (!response.ok) throw new Error(result?.error || `中央版本服務回覆 ${response.status}`);
  const signed = result?.release;
  if (!signed || !verifyOfflineLease(signed)) throw new Error("中央版本簽章無效");
  const payload = signed.payload;
  if (payload.type !== "ERIN_ERP_HOST_RELEASE_V1") throw new Error("中央版本資料格式錯誤");
  const issuedAt = new Date(String(payload.issuedAt || ""));
  const expiresAt = new Date(String(payload.expiresAt || ""));
  const version = String(payload.version || "");
  const image = String(payload.image || "");
  if (
    !VERSION_PATTERN.test(version) || image !== IMAGE ||
    Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime()) ||
    Date.now() < issuedAt.getTime() - 5 * 60_000 || Date.now() >= expiresAt.getTime()
  ) throw new Error("中央版本內容無效或已過期");
  return { version, image, publishedAt: String(payload.publishedAt || issuedAt.toISOString()) };
}

export async function triggerHostUpdater() {
  const url = process.env.HOST_UPDATE_URL;
  const token = process.env.HOST_UPDATE_TOKEN;
  if (!url || !token || token.length < 32) throw new Error("背景更新服務尚未安裝，請先執行新版 Host 安裝包一次");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10 * 60_000),
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "TimeoutError" ? "連線逾時" : "服務尚未啟動";
    throw new Error(`背景更新服務無法連線（${detail}）。請關閉並重新開啟艾琳 ERP，桌面程式會自動修復後再試`);
  }
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || `背景更新服務回覆 ${response.status}`);
}
