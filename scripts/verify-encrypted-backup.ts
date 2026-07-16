import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertSafeBackupName, decryptBackupFile, encryptBackupFile, postgresCommandConnection } from "../src/lib/encrypted-backup";

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), "erin-erp-backup-test-"));
  const source = path.join(directory, "source.dump");
  const encrypted = path.join(directory, "erin-erp-20260716T120000000Z.erpbackup");
  const restored = path.join(directory, "restored.dump");
  const wrongKeyTarget = path.join(directory, "wrong-key.dump");
  const tamperedTarget = path.join(directory, "tampered.dump");
  const secret = "correct-backup-key-that-is-longer-than-32-characters";

  try {
    const original = Buffer.concat([
      Buffer.from("PostgreSQL custom dump simulation\n", "utf8"),
      Buffer.from(Array.from({ length: 8192 }, (_, index) => index % 251)),
    ]);
    await writeFile(source, original);
    await encryptBackupFile(source, encrypted, secret);
    assert.notDeepEqual(await readFile(encrypted), original, "加密檔不可與原始資料相同");

    await decryptBackupFile(encrypted, restored, secret);
    assert.deepEqual(await readFile(restored), original, "正確金鑰必須完整還原原始資料");

    await assert.rejects(
      decryptBackupFile(encrypted, wrongKeyTarget, "wrong-backup-key-that-is-also-longer-than-32"),
      /authenticate|auth|Unsupported state/i,
    );
    await assert.rejects(readFile(wrongKeyTarget), /ENOENT/, "錯誤金鑰不得留下未驗證的部分檔案");

    const tampered = await readFile(encrypted);
    tampered[Math.floor(tampered.length / 2)] ^= 0xff;
    await writeFile(encrypted, tampered);
    await assert.rejects(
      decryptBackupFile(encrypted, tamperedTarget, secret),
      /authenticate|auth|Unsupported state/i,
    );
    await assert.rejects(readFile(tamperedTarget), /ENOENT/, "遭竄改的備份不得留下未驗證的部分檔案");

    assert.equal(assertSafeBackupName("erin-erp-20260716T120000000Z.erpbackup"), "erin-erp-20260716T120000000Z.erpbackup");
    assert.throws(() => assertSafeBackupName("../erin-erp-20260716T120000000Z.erpbackup"), /不合法/);
    assert.throws(() => assertSafeBackupName("backup.json"), /不合法/);

    const connection = postgresCommandConnection("postgresql://erp%20user:secret%2Fvalue@127.0.0.1:55439/erp_preview?schema=public&sslmode=require");
    assert.equal(connection.database, "erp_preview");
    assert.equal(connection.env.PGUSER, "erp user");
    assert.equal(connection.env.PGPASSWORD, "secret/value");
    assert.equal(connection.env.PGSSLMODE, "require");
    assert.equal(connection.env.schema, undefined, "Prisma 專用 schema 參數不可傳給 pg_dump");

    console.log("Encrypted backup confidentiality and tamper detection: PASS");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

void main();
