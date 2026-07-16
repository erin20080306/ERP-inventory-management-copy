import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertSafeBackupName, createEncryptedDatabaseBackup, decryptBackupFile, postgresCommandConnection } from "../src/lib/encrypted-backup";

async function main() {
  if (process.env.CONFIRM_RESTORE !== "ERIN-ERP-RESTORE") throw new Error("拒絕還原：必須設定 CONFIRM_RESTORE=ERIN-ERP-RESTORE");
  const databaseUrl = process.env.DATABASE_URL;
  const backupDir = process.env.BACKUP_DIR || "/backups";
  if (!databaseUrl) throw new Error("缺少 DATABASE_URL");
  const connection = postgresCommandConnection(databaseUrl);
  const name = assertSafeBackupName(path.basename(process.argv[2] || ""));
  const source = path.join(backupDir, name);
  const workDir = mkdtempSync(path.join(tmpdir(), "erin-erp-restore-"));
  const dump = path.join(workDir, "restore.dump");

  try {
    await decryptBackupFile(source, dump);
    execFileSync("pg_restore", ["--list", dump], { stdio: "ignore" });
    const safety = await createEncryptedDatabaseBackup();
    console.log(`還原前安全備份：${safety.name}`);
    execFileSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", "--dbname", connection.database, dump], { stdio: "inherit", env: connection.env });
    console.log(`還原完成：${name}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

void main();
