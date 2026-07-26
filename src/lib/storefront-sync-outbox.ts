import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type StorefrontOutboxStatus = "PENDING" | "PROCESSING" | "FAILED" | "DELIVERED" | "DISCARDED";

export type StorefrontOutboxRow = {
  id: string;
  tenantId: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  status: StorefrontOutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const EVENT_TYPE = "STOREFRONT_ORDER_STATUS";

export async function enqueueStorefrontStatusOutbox(tenantId: string, orderId: string) {
  const payload = JSON.stringify({ orderId, queuedAt: new Date().toISOString() });
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "StorefrontSyncOutbox" (
      "id", "tenantId", "aggregateId", "eventType", "payload", "status",
      "attempts", "nextAttemptAt", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${tenantId}, ${orderId}, ${EVENT_TYPE}, ${payload}::jsonb, 'PENDING',
      0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("tenantId", "eventType", "aggregateId") DO UPDATE SET
      "payload" = EXCLUDED."payload",
      "status" = 'PENDING',
      "nextAttemptAt" = CURRENT_TIMESTAMP,
      "lastError" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  `);
}

export async function claimStorefrontStatusOutbox(tenantId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return prisma.$queryRaw<StorefrontOutboxRow[]>(Prisma.sql`
    WITH candidates AS (
      SELECT "id"
      FROM "StorefrontSyncOutbox"
      WHERE "tenantId" = ${tenantId}
        AND "eventType" = ${EVENT_TYPE}
        AND "status" IN ('PENDING', 'FAILED')
        AND "nextAttemptAt" <= CURRENT_TIMESTAMP
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${safeLimit}
    )
    UPDATE "StorefrontSyncOutbox" AS outbox
    SET "status" = 'PROCESSING',
        "attempts" = outbox."attempts" + 1,
        "lastAttemptAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    FROM candidates
    WHERE outbox."id" = candidates."id"
    RETURNING outbox.*
  `);
}

export async function completeStorefrontStatusOutbox(id: string) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "StorefrontSyncOutbox"
    SET "status" = 'DELIVERED', "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `);
}

export async function completeStorefrontStatusOutboxByOrder(tenantId: string, orderId: string) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "StorefrontSyncOutbox"
    SET "status" = 'DELIVERED', "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tenantId" = ${tenantId}
      AND "eventType" = ${EVENT_TYPE}
      AND "aggregateId" = ${orderId}
  `);
}

export async function retryStorefrontStatusOutbox(id: string, attempts: number, error: string) {
  const delaySeconds = Math.min(3_600, Math.max(15, 2 ** Math.min(10, attempts) * 5));
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "StorefrontSyncOutbox"
    SET "status" = 'FAILED',
        "lastError" = ${error.slice(0, 2_000)},
        "nextAttemptAt" = CURRENT_TIMESTAMP + (${delaySeconds} * INTERVAL '1 second'),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `);
}

export async function discardStorefrontStatusOutbox(id: string, error: string) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "StorefrontSyncOutbox"
    SET "status" = 'DISCARDED',
        "lastError" = ${error.slice(0, 2_000)},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `);
}
