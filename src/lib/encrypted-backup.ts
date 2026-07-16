import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("ERINERPBK01", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;
const BACKUP_PATTERN = /^erin-erp-\d{8}T\d{9}Z\.erpbackup$/;

const PG_QUERY_ENV: Record<string, string> = {
  application_name: "PGAPPNAME",
  connect_timeout: "PGCONNECT_TIMEOUT",
  options: "PGOPTIONS",
  sslmode: "PGSSLMODE",
  sslcert: "PGSSLCERT",
  sslkey: "PGSSLKEY",
  sslrootcert: "PGSSLROOTCERT",
  sslcrl: "PGSSLCRL",
  target_session_attrs: "PGTARGETSESSIONATTRS",
};

function requireSecret(value = process.env.BACKUP_ENCRYPTION_KEY) {
  if (!value || value.length < 32) throw new Error("BACKUP_ENCRYPTION_KEY 必須至少 32 字元");
  return value;
}

export function postgresCommandConnection(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL 必須使用 PostgreSQL");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !database) throw new Error("DATABASE_URL 缺少主機或資料庫名稱");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: decodeURIComponent(url.hostname),
    PGPORT: url.port || "5432",
    PGDATABASE: database,
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  for (const [queryName, envName] of Object.entries(PG_QUERY_ENV)) {
    const value = url.searchParams.get(queryName);
    if (value) env[envName] = value;
  }
  return { database, env };
}

export async function encryptBackupFile(source: string, target: string, secret = requireSecret()) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(secret, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await writeFile(target, Buffer.concat([MAGIC, salt, iv]), { mode: 0o600 });
  await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags: "a", mode: 0o600 }));
  await appendFile(target, cipher.getAuthTag());
}

export async function decryptBackupFile(source: string, target: string, secret = requireSecret()) {
  const info = await stat(source);
  if (info.size <= HEADER_BYTES + TAG_BYTES) throw new Error("加密備份檔過短或已損壞");
  const handle = await open(source, "r");
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, info.size - TAG_BYTES);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("不是艾琳 ERP 加密備份檔");
    const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
    const iv = header.subarray(MAGIC.length + SALT_BYTES, HEADER_BYTES);
    const key = scryptSync(secret, salt, 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    await pipeline(createReadStream(source, { start: HEADER_BYTES, end: info.size - TAG_BYTES - 1 }), decipher, createWriteStream(target, { mode: 0o600 }));
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  } finally {
    await handle.close();
  }
}

async function sha256File(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function backupFilename(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  return `erin-erp-${stamp}.erpbackup`;
}

export async function listEncryptedBackups(directory = process.env.BACKUP_DIR || "/backups") {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const names = (await readdir(directory)).filter((name) => BACKUP_PATTERN.test(name));
  const rows = await Promise.all(names.map(async (name) => {
    const file = path.join(directory, name);
    const info = await stat(file);
    let manifest: any = null;
    try { manifest = JSON.parse(await readFile(`${file}.json`, "utf8")); } catch {}
    return { name, size: info.size, createdAt: manifest?.createdAt || info.mtime.toISOString(), sha256: manifest?.sha256 || null };
  }));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createEncryptedDatabaseBackup(options: { databaseUrl?: string; directory?: string; retentionDays?: number; now?: Date } = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("缺少 DATABASE_URL");
  const secret = requireSecret();
  const directory = options.directory || process.env.BACKUP_DIR || "/backups";
  const retentionDays = Math.max(1, options.retentionDays ?? Number(process.env.BACKUP_RETENTION_DAYS || 30));
  const now = options.now || new Date();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = backupFilename(now);
  const target = path.join(directory, filename);
  const pending = path.join(directory, `.${filename}.pending.dump`);
  try {
    const connection = postgresCommandConnection(databaseUrl);
    execFileSync("pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", "--file", pending, "--dbname", connection.database], { stdio: "pipe", env: connection.env });
    await encryptBackupFile(pending, target, secret);
  } finally {
    await rm(pending, { force: true });
  }
  const info = await stat(target);
  const manifest = {
    schema: "erin-erp-encrypted-postgres-backup-v1",
    name: filename,
    createdAt: now.toISOString(),
    size: info.size,
    sha256: await sha256File(target),
    encryption: "AES-256-GCM+scrypt",
    databaseFormat: "PostgreSQL custom dump",
  };
  await writeFile(`${target}.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60_000;
  for (const row of await listEncryptedBackups(directory)) {
    const file = path.join(directory, row.name);
    if ((await stat(file)).mtimeMs >= cutoff) continue;
    await rm(file, { force: true });
    await rm(`${file}.json`, { force: true });
  }
  return manifest;
}

export function assertSafeBackupName(name: string) {
  if (!BACKUP_PATTERN.test(name) || path.basename(name) !== name) throw new Error("備份檔名不合法");
  return name;
}
