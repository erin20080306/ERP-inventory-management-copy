import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

type NumberSequenceRow = {
  prefix: string;
  format: string | null;
  nextNo: number;
};

/**
 * Concurrency-safe document number allocation in one database round trip.
 *
 * The older implementation used UPSERT + SELECT FOR UPDATE + SELECT + UPDATE,
 * which added four sequential queries inside every interactive transaction.
 * On a remote PostgreSQL database that can consume most of Prisma's default
 * five-second transaction timeout by itself.
 */
export async function nextNumberFastInTransaction(
  tx: any,
  key: string,
  tenantId: string,
) {
  const seq = await tx.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, prefix: key, nextNo: 2 },
    update: { nextNo: { increment: 1 } },
    select: { prefix: true, format: true, nextNo: true },
  }) as NumberSequenceRow;

  // Existing row N is atomically incremented to N+1 and returns N+1.
  // A newly created row starts at 2, therefore both paths allocate 1 first.
  const allocatedNo = Math.max(1, Number(seq.nextNo) - 1);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(2);
  const roc = String(now.getFullYear() - 1911);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const seqStr = String(allocatedNo).padStart(4, "0");
  const isJournal = key === "JE";
  const format = seq.format || (isJournal ? "{roc}{mm}{dd}{seq:0000}" : "{prefix}{yyyy}{mm}-{seq:0000}");

  return format
    .replace("{prefix}", isJournal ? "" : seq.prefix)
    .replace("{roc}", roc)
    .replace("{yyyy}", yyyy)
    .replace("{yy}", yy)
    .replace("{mm}", mm)
    .replace("{dd}", dd)
    .replace("{seq:0000}", seqStr);
}

type NumberSequenceBatchRow = { key: string; prefix: string; format: string; nextNo: number };

function formatBatchNumber(row: NumberSequenceBatchRow, now: Date) {
  const allocatedNo = Math.max(1, Number(row.nextNo) - 1);
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(2);
  const roc = String(now.getFullYear() - 1911);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const seq = String(allocatedNo).padStart(4, "0");
  const isJournal = row.key === "JE";
  const format = row.format || (isJournal ? "{roc}{mm}{dd}{seq:0000}" : "{prefix}{yyyy}{mm}-{seq:0000}");
  return format
    .replace("{prefix}", isJournal ? "" : row.prefix)
    .replace("{roc}", roc)
    .replace("{yyyy}", yyyy)
    .replace("{yy}", yy)
    .replace("{mm}", mm)
    .replace("{dd}", dd)
    .replace("{seq:0000}", seq);
}

export async function nextNumbersFastInTransaction(tx: any, keys: string[], tenantId: string) {
  const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  if (!uniqueKeys.length) return {} as Record<string, string>;
  const rows = await tx.$queryRaw(Prisma.sql`
    INSERT INTO "NumberSequence" AS ns
      ("id", "tenantId", "key", "prefix", "nextNo", "format", "updatedAt")
    VALUES ${Prisma.join(uniqueKeys.map((key) => Prisma.sql`(${randomUUID()}, ${tenantId}, ${key}, ${key}, 2, ${key === "JE" ? "{roc}{mm}{dd}{seq:0000}" : "{prefix}{yyyy}{mm}-{seq:0000}"}, NOW())`))}
    ON CONFLICT ("tenantId", "key") DO UPDATE
    SET "nextNo" = ns."nextNo" + 1, "updatedAt" = NOW()
    RETURNING "key", "prefix", "format", "nextNo"
  `) as NumberSequenceBatchRow[];
  const now = new Date();
  return Object.fromEntries(rows.map((row: NumberSequenceBatchRow) => [row.key, formatBatchNumber(row, now)]));
}
