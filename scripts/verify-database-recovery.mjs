import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function decode(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

let configuredDatabaseUrl = null;
try {
  configuredDatabaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
} catch {
  configuredDatabaseUrl = null;
}

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const sourceDb = `erp_rehearsal_source_${stamp}`;
const restoreDb = `erp_rehearsal_restore_${stamp}`;
const freshDb = `erp_rehearsal_fresh_${stamp}`;
const safeName = /^erp_rehearsal_[a-z0-9_]+$/;
const pgHost = process.env.PGHOST || configuredDatabaseUrl?.hostname || "127.0.0.1";
const pgPort = process.env.PGPORT || configuredDatabaseUrl?.port || "5432";
const pgUser = process.env.PGUSER || decode(configuredDatabaseUrl?.username) || process.env.USER;
const pgPassword = process.env.PGPASSWORD || decode(configuredDatabaseUrl?.password);
const adminDb = process.env.PGDATABASE || "postgres";
const keep = process.env.KEEP_REHEARSAL_DB === "true";
const baselineMigration = "20260714000000_baseline";
const commandTimeoutMs = positiveInteger(process.env.DB_REHEARSAL_COMMAND_TIMEOUT_MS, 180_000);
const overallTimeoutMs = positiveInteger(process.env.DB_REHEARSAL_TOTAL_TIMEOUT_MS, 15 * 60_000);
const overallDeadline = Date.now() + overallTimeoutMs;

if (!pgUser) throw new Error("找不到 PGUSER、DATABASE_URL 使用者或 USER");
if (![sourceDb, restoreDb, freshDb].every((database) => safeName.test(database))) throw new Error("測試資料庫名稱不符合安全規則");

const workDir = mkdtempSync(join(tmpdir(), "erin-erp-rehearsal-"));
const baselineProjectDir = join(workDir, "baseline-prisma");
const baselineSchemaPath = join(baselineProjectDir, "schema.prisma");
const baselineMigrationsDir = join(baselineProjectDir, "migrations");
const preBackup = join(workDir, "before-migration.dump");
const postBackup = join(workDir, "after-migration.dump");
const pgOptions = [
  process.env.PGOPTIONS,
  "-c statement_timeout=120000",
  "-c lock_timeout=15000",
  "-c idle_in_transaction_session_timeout=120000",
].filter(Boolean).join(" ");
const pgEnv = {
  ...process.env,
  CI: process.env.CI || "true",
  PGHOST: pgHost,
  PGPORT: pgPort,
  PGUSER: pgUser,
  PGPASSWORD: pgPassword,
  PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT || "10",
  PGOPTIONS: pgOptions,
};

function run(command, args, options = {}) {
  const label = options.label || `${command} ${args.join(" ")}`;
  const remaining = overallDeadline - Date.now();
  if (!options.cleanup && remaining <= 0) {
    throw new Error(`資料庫復原演練已超過總上限 ${Math.ceil(overallTimeoutMs / 60_000)} 分鐘，目前步驟：${label}`);
  }

  const timeout = options.cleanup
    ? Math.min(options.timeoutMs || 60_000, 60_000)
    : Math.min(options.timeoutMs || commandTimeoutMs, Math.max(1_000, remaining));
  const startedAt = Date.now();
  process.stdout.write(`→ ${label}（上限 ${Math.ceil(timeout / 1000)} 秒）\n`);

  try {
    const output = execFileSync(command, args, {
      cwd: process.cwd(),
      env: options.env || pgEnv,
      encoding: options.encoding || "utf8",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    process.stdout.write(`✓ ${label}（${((Date.now() - startedAt) / 1000).toFixed(1)} 秒）\n`);
    return output;
  } catch (error) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const timedOut = error?.code === "ETIMEDOUT" || error?.signal === "SIGKILL" || error?.killed === true;
    const stderr = String(error?.stderr || "").trim();
    if (stderr) process.stderr.write(`${stderr}\n`);
    if (timedOut) {
      throw new Error(`${label} 超過 ${Math.ceil(timeout / 1000)} 秒，已強制停止；請檢查 PostgreSQL 連線、鎖定或密碼設定（已執行 ${elapsed} 秒）`, { cause: error });
    }
    throw new Error(`${label} 執行失敗（${elapsed} 秒）${stderr ? `：${stderr.split("\n").slice(-3).join(" | ")}` : ""}`, { cause: error });
  }
}

function url(database) {
  const target = new URL("postgresql://127.0.0.1");
  target.hostname = pgHost;
  target.port = pgPort;
  target.username = pgUser;
  if (pgPassword) target.password = pgPassword;
  target.pathname = `/${database}`;
  target.searchParams.set("schema", "public");
  target.searchParams.set("connect_timeout", "10");
  return target.toString();
}

function psql(database, sql, label, options = {}) {
  return run("psql", [
    "--no-password",
    "--dbname", database,
    "--set", "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command", sql,
  ], { label, capture: true, ...options });
}

function prisma(args, label, database) {
  return run("npx", ["--no-install", "prisma", ...args], {
    label,
    env: { ...pgEnv, DATABASE_URL: url(database) },
  });
}

function createDatabase(database) {
  run("createdb", ["--no-password", "--maintenance-db", adminDb, database], { label: `建立 ${database}` });
}

function dropDatabase(database, options = {}) {
  if (!safeName.test(database)) throw new Error(`拒絕刪除非測試資料庫：${database}`);
  run("dropdb", ["--no-password", "--if-exists", "--force", "--maintenance-db", adminDb, database], {
    label: `清除 ${database}`,
    ...options,
  });
}

function prepareBaselineProject() {
  const sourceSchemaPath = join(process.cwd(), "prisma", "schema.prisma");
  const sourceMigrationsDir = join(process.cwd(), "prisma", "migrations");
  const sourceMigrationPath = join(sourceMigrationsDir, baselineMigration, "migration.sql");
  const sourceLockPath = join(sourceMigrationsDir, "migration_lock.toml");
  const targetMigrationDir = join(baselineMigrationsDir, baselineMigration);

  if (!existsSync(sourceSchemaPath)) throw new Error(`找不到 Prisma schema：${sourceSchemaPath}`);
  if (!existsSync(sourceMigrationPath)) throw new Error(`找不到 baseline migration：${sourceMigrationPath}`);

  mkdirSync(targetMigrationDir, { recursive: true });
  copyFileSync(sourceSchemaPath, baselineSchemaPath);
  copyFileSync(sourceMigrationPath, join(targetMigrationDir, "migration.sql"));
  if (existsSync(sourceLockPath)) {
    copyFileSync(sourceLockPath, join(baselineMigrationsDir, "migration_lock.toml"));
  }
}

try {
  psql(adminDb, "SELECT 1", "確認 PostgreSQL 連線與密碼");
  dropDatabase(sourceDb);
  dropDatabase(restoreDb);
  dropDatabase(freshDb);
  createDatabase(sourceDb);

  prepareBaselineProject();
  prisma(["migrate", "deploy", "--schema", baselineSchemaPath], "只套用 baseline migration 建立舊版資料庫", sourceDb);
  const baselineCount = Number(psql(sourceDb, `
    SELECT count(*)
    FROM "_prisma_migrations"
    WHERE "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL;
  `, "確認舊版資料庫只有 baseline migration").trim());
  if (baselineCount !== 1) throw new Error(`舊版資料庫 migration 數量應為 1，實際為 ${baselineCount}`);

  psql(sourceDb, `
    INSERT INTO "Tenant" ("id", "name", "createdAt") VALUES ('rehearsal-tenant', '遷移演練公司', CURRENT_TIMESTAMP);
    INSERT INTO "User" ("id", "tenantId", "username", "email", "name", "passwordHash", "createdAt", "updatedAt")
    VALUES ('rehearsal-user', 'rehearsal-tenant', 'rehearsal-admin', 'rehearsal@example.invalid', '演練管理員', 'not-a-real-password', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    INSERT INTO "AuditLog" ("id", "userId", "action", "module", "detail", "createdAt")
    VALUES ('rehearsal-audit', 'rehearsal-user', 'CREATE', 'rehearsal', 'before migration', CURRENT_TIMESTAMP);
  `, "寫入舊版保留樣本");

  run("pg_dump", ["--no-password", "--format", "custom", "--file", preBackup, sourceDb], { label: "建立 migration 前備份" });
  prisma(["migrate", "deploy"], "從 baseline 套用後續正式 migration", sourceDb);

  const migrated = psql(sourceDb, `
    SELECT json_build_object(
      'tenantCount', (SELECT count(*) FROM "Tenant"),
      'userCount', (SELECT count(*) FROM "User"),
      'auditCount', (SELECT count(*) FROM "AuditLog" WHERE "id" = 'rehearsal-audit'),
      'businessMode', (SELECT "businessMode" FROM "Tenant" WHERE "id" = 'rehearsal-tenant'),
      'licenseStatus', (SELECT "licenseStatus" FROM "Tenant" WHERE "id" = 'rehearsal-tenant'),
      'posTables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('PosRegister','PosShift','PosSale','PosSaleItem','PosPayment','PosRefund','PosRefundItem','PosRefundPayment')),
      'accountingPeriodTable', to_regclass('public."AccountingPeriod"') IS NOT NULL,
      'deviceRoleColumn', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LicenseDevice' AND column_name = 'deviceRole'),
      'migrationCount', (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL)
    );
  `, "驗證 migration 與既有資料").trim();

  const migratedResult = JSON.parse(migrated);
  if (Number(migratedResult.tenantCount) !== 1 || Number(migratedResult.userCount) !== 1 || Number(migratedResult.auditCount) !== 1) throw new Error("migration 後既有資料筆數不符");
  if (migratedResult.businessMode !== "ERP" || migratedResult.licenseStatus !== "TRIAL") throw new Error("既有租戶的授權預設值不符");
  if (Number(migratedResult.posTables) !== 8 || migratedResult.accountingPeriodTable !== true || migratedResult.deviceRoleColumn !== true || Number(migratedResult.migrationCount) < 6) throw new Error("新資料表或 migration 記錄不完整");

  run("pg_dump", ["--no-password", "--format", "custom", "--file", postBackup, sourceDb], { label: "建立 migration 後備份" });

  createDatabase(restoreDb);
  run("pg_restore", ["--no-password", "--exit-on-error", "--no-owner", "--dbname", restoreDb, preBackup], { label: "還原 migration 前備份" });
  const oldRestore = psql(restoreDb, `
    SELECT json_build_object(
      'tenantCount', (SELECT count(*) FROM "Tenant"),
      'hasBusinessMode', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Tenant' AND column_name = 'businessMode')
    );
  `, "驗證回滾備份").trim();
  const oldRestoreResult = JSON.parse(oldRestore);
  if (Number(oldRestoreResult.tenantCount) !== 1 || oldRestoreResult.hasBusinessMode !== false) throw new Error("migration 前備份還原結果不符");

  dropDatabase(restoreDb);
  createDatabase(restoreDb);
  run("pg_restore", ["--no-password", "--exit-on-error", "--no-owner", "--dbname", restoreDb, postBackup], { label: "還原 migration 後備份" });
  const postRestore = psql(restoreDb, `
    SELECT json_build_object(
      'tenantCount', (SELECT count(*) FROM "Tenant"),
      'businessMode', (SELECT "businessMode" FROM "Tenant" WHERE "id" = 'rehearsal-tenant'),
      'posSaleTable', to_regclass('public."PosSale"') IS NOT NULL,
      'posRefundTable', to_regclass('public."PosRefund"') IS NOT NULL,
      'accountingPeriodTable', to_regclass('public."AccountingPeriod"') IS NOT NULL,
      'deviceRoleColumn', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LicenseDevice' AND column_name = 'deviceRole'),
      'migrationCount', (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL)
    );
  `, "驗證 migration 後災難還原").trim();
  const postRestoreResult = JSON.parse(postRestore);
  if (Number(postRestoreResult.tenantCount) !== 1 || postRestoreResult.businessMode !== "ERP" || postRestoreResult.posSaleTable !== true || postRestoreResult.posRefundTable !== true || postRestoreResult.accountingPeriodTable !== true || postRestoreResult.deviceRoleColumn !== true || Number(postRestoreResult.migrationCount) < 6) throw new Error("migration 後備份還原結果不符");

  createDatabase(freshDb);
  prisma(["migrate", "deploy"], "驗證全新空白資料庫安裝", freshDb);
  const freshInstall = psql(freshDb, `
    SELECT json_build_object(
      'tenantTable', to_regclass('public."Tenant"') IS NOT NULL,
      'posSaleTable', to_regclass('public."PosSale"') IS NOT NULL,
      'posRefundTable', to_regclass('public."PosRefund"') IS NOT NULL,
      'accountingPeriodTable', to_regclass('public."AccountingPeriod"') IS NOT NULL,
      'deviceRoleColumn', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LicenseDevice' AND column_name = 'deviceRole'),
      'migrationCount', (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL)
    );
  `, "驗證全新安裝結構").trim();
  const freshInstallResult = JSON.parse(freshInstall);
  if (freshInstallResult.tenantTable !== true || freshInstallResult.posSaleTable !== true || freshInstallResult.posRefundTable !== true || freshInstallResult.accountingPeriodTable !== true || freshInstallResult.deviceRoleColumn !== true || Number(freshInstallResult.migrationCount) < 6) throw new Error("全新空白資料庫 migration 結果不符");

  process.stdout.write(`${JSON.stringify({ ok: true, migrated: migratedResult, rollbackRestore: oldRestoreResult, disasterRestore: postRestoreResult, freshInstall: freshInstallResult }, null, 2)}\n`);
} finally {
  if (!keep) {
    for (const database of [sourceDb, restoreDb, freshDb]) {
      try {
        dropDatabase(database, { cleanup: true });
      } catch (error) {
        process.stderr.write(`清理 ${database} 失敗：${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    rmSync(workDir, { recursive: true, force: true });
  } else {
    process.stdout.write(`保留測試資料庫：${sourceDb}, ${restoreDb}, ${freshDb}\n暫存備份：${workDir}\n`);
  }
}
