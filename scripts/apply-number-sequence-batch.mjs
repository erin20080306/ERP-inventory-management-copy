import { readFileSync, writeFileSync } from "node:fs";

const path = "src/lib/number-sequence.ts";
let source = readFileSync(path, "utf8");

if (!source.includes('import { randomUUID } from "node:crypto";')) {
  source = `import { randomUUID } from "node:crypto";\nimport { Prisma } from "@prisma/client";\n\n${source}`;
}

if (!source.includes("export async function nextNumbersFastInTransaction")) {
  const addition = [
    "",
    "type NumberSequenceBatchRow = { key: string; prefix: string; format: string; nextNo: number };",
    "",
    "function formatBatchNumber(row: NumberSequenceBatchRow, now: Date) {",
    "  const allocatedNo = Math.max(1, Number(row.nextNo) - 1);",
    "  const yyyy = String(now.getFullYear());",
    "  const yy = yyyy.slice(2);",
    "  const roc = String(now.getFullYear() - 1911);",
    "  const mm = String(now.getMonth() + 1).padStart(2, \"0\");",
    "  const dd = String(now.getDate()).padStart(2, \"0\");",
    "  const seq = String(allocatedNo).padStart(4, \"0\");",
    "  const isJournal = row.key === \"JE\";",
    "  const format = row.format || (isJournal ? \"{roc}{mm}{dd}{seq:0000}\" : \"{prefix}{yyyy}{mm}-{seq:0000}\");",
    "  return format",
    "    .replace(\"{prefix}\", isJournal ? \"\" : row.prefix)",
    "    .replace(\"{roc}\", roc)",
    "    .replace(\"{yyyy}\", yyyy)",
    "    .replace(\"{yy}\", yy)",
    "    .replace(\"{mm}\", mm)",
    "    .replace(\"{dd}\", dd)",
    "    .replace(\"{seq:0000}\", seq);",
    "}",
    "",
    "export async function nextNumbersFastInTransaction(tx: any, keys: string[], tenantId: string) {",
    "  const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];",
    "  if (!uniqueKeys.length) return {} as Record<string, string>;",
    "  const rows = await tx.$queryRaw(Prisma.sql`",
    "    INSERT INTO \"NumberSequence\" AS ns",
    "      (\"id\", \"tenantId\", \"key\", \"prefix\", \"nextNo\", \"format\", \"updatedAt\")",
    "    VALUES ${Prisma.join(uniqueKeys.map((key) => Prisma.sql`(${randomUUID()}, ${tenantId}, ${key}, ${key}, 2, ${key === \"JE\" ? \"{roc}{mm}{dd}{seq:0000}\" : \"{prefix}{yyyy}{mm}-{seq:0000}\"}, NOW())`))}",
    "    ON CONFLICT (\"tenantId\", \"key\") DO UPDATE",
    "    SET \"nextNo\" = ns.\"nextNo\" + 1, \"updatedAt\" = NOW()",
    "    RETURNING \"key\", \"prefix\", \"format\", \"nextNo\"",
    "  `) as NumberSequenceBatchRow[];",
    "  const now = new Date();",
    "  return Object.fromEntries(rows.map((row: NumberSequenceBatchRow) => [row.key, formatBatchNumber(row, now)]));",
    "}",
    "",
  ].join("\n");
  source = `${source.trimEnd()}\n${addition}`;
}

writeFileSync(path, source);
console.log("Batch number sequence patch applied.");
