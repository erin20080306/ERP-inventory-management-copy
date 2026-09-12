const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("請設定 DATABASE_URL");

export function assertTestDatabase(expectedNamePattern: RegExp, expectedLabel: string) {
  const parsed = new URL(databaseUrl!);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const isNamedTestDatabase = expectedNamePattern.test(databaseName);
  // GitHub Actions 的服務容器只存在於單次 run，且只能由 localhost 連到，
  // 因此只要確認「在 Actions 裡」＋「連本機」＋「資料庫名以 erp 開頭」即可放行。
  //
  // 原本還額外寫死 databaseName === "erp" 與使用者 postgres，
  // 但 .github/workflows/ci.yml 用的是 erp_ci 與 erp 使用者，兩邊長期對不上，
  // 導致 main 的 CI 一直卡在這裡。放寬的是名稱與帳號，不是「不得連到遠端資料庫」這個安全性質。
  const isGithubActionsEphemeralDatabase =
    process.env.GITHUB_ACTIONS === "true"
    && process.env.CI === "true"
    && /^erp(_[a-z0-9_]+)?$/.test(databaseName)
    && ["127.0.0.1", "localhost"].includes(parsed.hostname);

  if (!isNamedTestDatabase && !isGithubActionsEphemeralDatabase) {
    throw new Error(`只允許在 ${expectedLabel} 測試資料庫，或 GitHub Actions 的本機暫存 erp 資料庫執行；目前為 ${parsed.hostname}/${databaseName}`);
  }

  process.stdout.write(`測試資料庫安全檢查：${isNamedTestDatabase ? expectedLabel : "GitHub Actions 暫存資料庫"}\n`);
}
