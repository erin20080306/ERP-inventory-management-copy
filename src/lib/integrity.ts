import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

type AuditInput = {
  userId?: string | null;
  action: string;
  module: string;
  refId?: string;
  detail?: string;
  ip?: string;
};

function secret() {
  return process.env.INTEGRITY_SECRET || process.env.LICENSE_AUDIT_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function hash(material: Record<string, unknown>, key: string) {
  return createHmac("sha256", key).update(stableJson(material)).digest("hex");
}

export async function appendAuditLog(input: AuditInput) {
  const key = secret();
  const user = input.userId ? await prisma.user.findUnique({ where: { id: input.userId }, select: { tenantId: true } }) : null;
  const tenantId = user?.tenantId ?? null;
  if (!key || !tenantId) return prisma.auditLog.create({ data: { ...input, tenantId } });

  const createdAt = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`audit:${tenantId}`}))`;
    const previous = await tx.auditLog.findFirst({ where: { tenantId, entryHash: { not: null } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { entryHash: true } });
    const previousHash = previous?.entryHash ?? "GENESIS";
    const material = { tenantId, userId: input.userId ?? null, action: input.action, module: input.module, refId: input.refId ?? null, detail: input.detail ?? null, ip: input.ip ?? null, previousHash, createdAt: createdAt.toISOString(), integrityVersion: 1 };
    const entryHash = hash(material, key);
    return tx.auditLog.create({ data: { ...input, tenantId, previousHash, entryHash, integrityVersion: 1, createdAt } });
  }, { isolationLevel: "ReadCommitted" });
}

export async function verifyAuditChain(tenantId: string) {
  const key = secret();
  if (!key) return { valid: false, checked: 0, reason: "缺少 INTEGRITY_SECRET" };
  const rows = await prisma.auditLog.findMany({ where: { tenantId, entryHash: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  let previousHash = "GENESIS";
  for (const row of rows) {
    const material = { tenantId, userId: row.userId ?? null, action: row.action, module: row.module, refId: row.refId ?? null, detail: row.detail ?? null, ip: row.ip ?? null, previousHash, createdAt: row.createdAt.toISOString(), integrityVersion: row.integrityVersion };
    const expected = hash(material, key);
    const actualBuffer = Buffer.from(row.entryHash!, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (row.previousHash !== previousHash || actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      return { valid: false, checked: rows.length, brokenEntryId: row.id };
    }
    previousHash = row.entryHash!;
  }
  return { valid: true, checked: rows.length, headHash: previousHash };
}
