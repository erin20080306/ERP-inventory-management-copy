const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("請設定 DATABASE_URL");

export function assertTestDatabase(expectedNamePattern: RegExp, expectedLabel: string) {
  const parsed = new URL(databaseUrl!);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const isNamedTestDatabase = expectedNamePattern.test(databaseName);
  const isGithubActionsEphemeralDatabase =
    process.env.GITHUB_ACTIONS === "true"
    && process.env.CI === "true"
    && databaseName === "erp"
    && ["127.0.0.1", "localhost"].includes(parsed.hostname)
    && decodeURIComponent(parsed.username) === "postgres";

  if (!isNamedTestDatabase && !isGithubActionsEphemeralDatabase) {
    throw new Error(`只允許在 ${expectedLabel} 測試資料庫，或 GitHub Actions 的本機暫存 erp 資料庫執行；目前為 ${parsed.hostname}/${databaseName}`);
  }

  process.stdout.write(`測試資料庫安全檢查：${isNamedTestDatabase ? expectedLabel : "GitHub Actions 暫存資料庫"}\n`);
}
