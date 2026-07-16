import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const sourceDb = `erp_rehearsal_source_${stamp}`;
const restoreDb = `erp_rehearsal_restore_${stamp}`;
const freshDb = `erp_rehearsal_fresh_${stamp}`;
const safeName = /^erp_rehearsal_[a-z0-9_]+$/;
const pgHost = process.env.PGHOST || "127.0.0.1";
const pgPort = process.env.PGPORT || "5432";
const pgUser = process.env.PGUSER || process.env.USER;
const adminDb = process.env.PGDATABASE || "postgres";
const keep = process.env.KEEP_REHEARSAL_DB === "true";
const baselineMigration = "20260714000000_baseline";

if (!pgUser) throw new Error("找不到 PGUSER 或 USER");
if (![sourceDb, restoreDb, freshDb].every((database) => safeName.test(database))) throw new Error("測試資料庫名稱不符合安全規則");

const workDir = mkdtempSync(join(tmpdir(), "erin-erp-rehearsal-"));
const oldSchemaPath = join(workDir, "schema-before.prisma");
const preBackup = join(workDir, "before-migration.dump");
const postBackup = join(workDir, "after-migration.dump");
const pgEnv = { ...process.env, PGHOST: pgHost, PGPORT: pgPort, PGUSER: pgUser };

function run(command, args, options = {}) {
  process.stdout.write(`→ ${options.label || command}\n`);
  return execFileSync(command, args, {
    cwd: process.cwd(),
    env: options.env || pgEnv,
    encoding: options.encoding || "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

function url(database) {
  const user = encodeURIComponent(pgUser);
  return `postgresql://${user}@${pgHost}:${pgPort}/${database}?schema=public`;
}

function psql(database, sql, label) {
  return run("psql", ["--dbname", database, "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", sql], { label, capture: true });
}

function createDatabase(database) {
  run("createdb", ["--maintenance-db", adminDb, database], { label: `建立 ${database}` });
}

function dropDatabase(database) {
  if (!safeName.test(database)) throw new Error(`拒絕刪除非測試資料庫：${database}`);
  run("dropdb", ["--if-exists", "--force", "--maintenance-db", adminDb, database], { label: `清除 ${database}` });
}

try {
  dropDatabase(sourceDb);
  dropDatabase(restoreDb);
  dropDatabase(freshDb);
  createDatabase(sourceDb);

  const oldSchema = run("git", ["show", "HEAD:prisma/schema.prisma"], { label: "讀取變更前 Prisma schema", capture: true });
  writeFileSync(oldSchemaPath, oldSchema);
  run("npx", ["prisma", "db", "push", "--schema", oldSchemaPath, "--skip-generate"], {
    label: "建立變更前資料庫結構",
    env: { ...pgEnv, DATABASE_URL: url(sourceDb) },
  });

  psql(sourceDb, `
    INSERT INTO "Tenant" ("id", "name", "createdAt") VALUES ('rehearsal-tenant', '遷移演練公司', CURRENT_TIMESTAMP);
    INSERT INTO "User" ("id", "tenantId", "username", "email", "name", "passwordHash", "createdAt", "updatedAt")
    VALUES ('rehearsal-user', 'rehearsal-tenant', 'rehearsal-admin', 'rehearsal@example.invalid', '演練管理員', 'not-a-real-password', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    INSERT INTO "AuditLog" ("id", "userId", "action", "module", "detail", "createdAt")
    VALUES ('rehearsal-audit', 'rehearsal-user', 'CREATE', 'rehearsal', 'before migration', CURRENT_TIMESTAMP);
  `, "寫入舊版保留樣本");

  run("pg_dump", ["--format", "custom", "--file", preBackup, sourceDb], { label: "建立 migration 前備份" });
  run("npx", ["prisma", "migrate", "resolve", "--applied", baselineMigration], {
    label: "標記既有資料庫 baseline",
    env: { ...pgEnv, DATABASE_URL: url(sourceDb) },
  });
  run("npx", ["prisma", "migrate", "deploy"], {
    label: "套用正式 migration",
    env: { ...pgEnv, DATABASE_URL: url(sourceDb) },
  });

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

  run("pg_dump", ["--format", "custom", "--file", postBackup, sourceDb], { label: "建立 migration 後備份" });

  createDatabase(restoreDb);
  run("pg_restore", ["--exit-on-error", "--no-owner", "--dbname", restoreDb, preBackup], { label: "還原 migration 前備份" });
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
  run("pg_restore", ["--exit-on-error", "--no-owner", "--dbname", restoreDb, postBackup], { label: "還原 migration 後備份" });
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
  run("npx", ["prisma", "migrate", "deploy"], {
    label: "驗證全新空白資料庫安裝",
    env: { ...pgEnv, DATABASE_URL: url(freshDb) },
  });
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
    dropDatabase(sourceDb);
    dropDatabase(restoreDb);
    dropDatabase(freshDb);
    rmSync(workDir, { recursive: true, force: true });
  } else {
    process.stdout.write(`保留測試資料庫：${sourceDb}, ${restoreDb}, ${freshDb}\n暫存備份：${workDir}\n`);
  }
}
