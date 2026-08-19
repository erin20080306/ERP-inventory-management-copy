import { spawnSync } from "node:child_process";

// Vercel build 期間套用 Prisma 遷移。
// 預設「失敗即中斷部署」以確保 schema 與程式一致；但提供兩個放行開關，
// 讓資料庫暫時無法連線（如 Neon 免費額度用完）時仍能先把程式部署上去：
//   SKIP_DB_MIGRATE=1  → 完全跳過遷移（最省事，DB 完全不可用時用）
//   MIGRATE_NONFATAL=1 → 仍嘗試遷移，失敗只警告、不中斷部署
// 另有 MIGRATE_RETRIES（預設 3）處理 Neon 冷啟動造成的短暫連線失敗。
// ※ 放行後請於 DB 恢復時「移除開關並重新部署」，讓待套用的遷移補上。

const log = (m) => console.log(`[migrate-deploy] ${m}`);

if (process.env.VERCEL !== "1") {
  log("非 Vercel 環境，跳過遷移。");
  process.exit(0);
}

if (process.env.SKIP_DB_MIGRATE === "1") {
  log("偵測到 SKIP_DB_MIGRATE=1 → 跳過資料庫遷移（記得 DB 恢復後移除此開關並重新部署）。");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  if (process.env.VERCEL_ENV === "preview") {
    log("Preview 無 DATABASE_URL → 跳過遷移。");
    process.exit(0);
  }
  console.error("[migrate-deploy] 缺少 DATABASE_URL，無法遷移。");
  process.exit(1);
}

const nonFatal = process.env.MIGRATE_NONFATAL === "1";
const maxAttempts = Math.max(1, Number(process.env.MIGRATE_RETRIES) || 3);
const command = process.platform === "win32" ? "npx.cmd" : "npx";

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let status = 1;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  log(`prisma migrate deploy（第 ${attempt}/${maxAttempts} 次）…`);
  const result = spawnSync(command, ["prisma", "migrate", "deploy"], { stdio: "inherit", env: process.env });
  if (result.error) {
    log(`無法啟動 prisma：${result.error.message}`);
    status = 1;
  } else {
    status = result.status ?? 1;
  }
  if (status === 0) break;
  if (attempt < maxAttempts) {
    const waitMs = 5000 * attempt; // 5s, 10s, ...（處理冷啟動）
    log(`遷移失敗，${waitMs / 1000}s 後重試…`);
    sleepSync(waitMs);
  }
}

if (status !== 0) {
  if (nonFatal) {
    log("遷移失敗，但 MIGRATE_NONFATAL=1 → 不中斷部署。請於 DB 恢復後重新部署以套用遷移。");
    process.exit(0);
  }
  console.error("[migrate-deploy] 遷移失敗，中斷部署。可暫時設 SKIP_DB_MIGRATE=1 或 MIGRATE_NONFATAL=1 放行。");
  process.exit(status);
}

log("遷移完成。");
process.exit(0);
