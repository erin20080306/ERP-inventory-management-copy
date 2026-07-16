import { createEncryptedDatabaseBackup } from "../src/lib/encrypted-backup";

async function main() {
  const result = await createEncryptedDatabaseBackup();
  console.log(JSON.stringify({ ok: true, ...result }));
}

void main();
