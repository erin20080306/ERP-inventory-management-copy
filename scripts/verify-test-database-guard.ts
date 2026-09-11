import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * 驗證「測試資料庫守門」與實際 CI 設定沒有脫節。
 *
 * 起因：assert-test-database.ts 的 GitHub Actions 例外條款原本寫死
 * 資料庫名 erp 與使用者 postgres，但 .github/workflows/ci.yml 用的是 erp_ci 與 erp，
 * 兩邊長期對不上，導致 main 的 CI 一直卡在 test:accounting 而沒人發現。
 *
 * 這支測試不需要資料庫，會在 CI 早期就跑，任何一邊再改動而對不上都會立刻失敗。
 */

const root = path.resolve(__dirname, "..");
const guardPath = path.join(root, "scripts", "assert-test-database.ts");

function runGuard(env: Record<string, string>) {
  const script = `
    import { assertTestDatabase } from ${JSON.stringify(guardPath)};
    assertTestDatabase(/^erp_accounting_test_[a-z0-9_]+$/, "erp_accounting_test_*");
  `;
  try {
    execFileSync("npx", ["tsx", "-e", script], {
      cwd: root,
      env: { ...process.env, GITHUB_ACTIONS: "", CI: "", ...env },
      stdio: "pipe",
    });
    return { allowed: true };
  } catch {
    return { allowed: false };
  }
}

// === 1. CI workflow 實際提供的 DATABASE_URL 必須被放行 ===
const workflow = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
const workflowUrl = workflow.match(/DATABASE_URL:\s*(\S+)/)?.[1];
assert.ok(workflowUrl, "ci.yml 找不到 DATABASE_URL，請確認工作流程設定");

assert.equal(
  runGuard({ GITHUB_ACTIONS: "true", CI: "true", DATABASE_URL: workflowUrl! }).allowed,
  true,
  `守門程式擋下了 CI 實際使用的資料庫（${workflowUrl}）。`
  + "修 scripts/assert-test-database.ts 或 .github/workflows/ci.yml，讓兩邊一致。",
);

// === 2. 安全性質：以下情境一律不得放行 ===
const mustReject: [string, Record<string, string>][] = [
  ["非 CI 環境連遠端正式庫", { DATABASE_URL: "postgresql://user:pw@db.example.com:5432/erp_prod" }],
  ["非 CI 環境連本機非測試庫", { DATABASE_URL: "postgresql://erp:erp@localhost:5432/erp_ci" }],
  ["CI 環境但連遠端主機", { GITHUB_ACTIONS: "true", CI: "true", DATABASE_URL: "postgresql://erp:erp@db.neon.tech:5432/erp_ci" }],
  ["CI 環境但資料庫名不以 erp 開頭", { GITHUB_ACTIONS: "true", CI: "true", DATABASE_URL: "postgresql://erp:erp@localhost:5432/customer_live" }],
  ["只設 CI 沒在 GitHub Actions", { CI: "true", DATABASE_URL: "postgresql://erp:erp@localhost:5432/erp_ci" }],
];

for (const [label, env] of mustReject) {
  assert.equal(runGuard(env).allowed, false, `守門程式應該擋下「${label}」但放行了`);
}

// === 3. 具名測試資料庫在本機開發時仍可用 ===
assert.equal(
  runGuard({ DATABASE_URL: "postgresql://erp:erp@localhost:5432/erp_accounting_test_local" }).allowed,
  true,
  "具名測試資料庫（erp_accounting_test_*）應該永遠可用，否則本機沒辦法跑帳務驗證",
);

console.log(`✅ 測試資料庫守門驗證通過：CI 設定一致，${mustReject.length} 種危險情境都被擋下`);
