CREATE TABLE IF NOT EXISTS "StorefrontSyncOutbox" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL DEFAULT 'SALES_ORDER',
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorefrontSyncOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorefrontSyncOutbox_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StorefrontSyncOutbox_status_check"
    CHECK ("status" IN ('PENDING', 'PROCESSING', 'FAILED', 'DELIVERED', 'DISCARDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "StorefrontSyncOutbox_tenant_event_aggregate_key"
  ON "StorefrontSyncOutbox"("tenantId", "eventType", "aggregateId");

CREATE INDEX IF NOT EXISTS "StorefrontSyncOutbox_dispatch_idx"
  ON "StorefrontSyncOutbox"("tenantId", "status", "nextAttemptAt", "createdAt");

CREATE INDEX IF NOT EXISTS "StorefrontSyncOutbox_created_idx"
  ON "StorefrontSyncOutbox"("createdAt");

INSERT INTO "StorefrontSyncOutbox" (
  "id", "tenantId", "aggregateId", "eventType", "payload", "status", "attempts",
  "nextAttemptAt", "createdAt", "updatedAt"
)
SELECT
  md5(s."key" || clock_timestamp()::text || random()::text),
  split_part(s."key", ':', 2),
  substring(s."key" from '^storefront-order-status-pending:[^:]+:(.+)$'),
  'STOREFRONT_ORDER_STATUS',
  CASE
    WHEN s."value" ~ '^\s*\{' THEN s."value"::jsonb
    ELSE jsonb_build_object('orderId', substring(s."key" from '^storefront-order-status-pending:[^:]+:(.+)$'))
  END,
  'PENDING', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SystemSetting" s
JOIN "Tenant" t ON t."id" = split_part(s."key", ':', 2)
WHERE s."key" LIKE 'storefront-order-status-pending:%'
ON CONFLICT ("tenantId", "eventType", "aggregateId") DO UPDATE SET
  "payload" = EXCLUDED."payload",
  "status" = 'PENDING',
  "attempts" = "StorefrontSyncOutbox"."attempts" + 1,
  "nextAttemptAt" = CURRENT_TIMESTAMP,
  "lastError" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION mirror_storefront_status_setting_to_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_id TEXT;
  order_id TEXT;
  event_payload JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."key" LIKE 'storefront-order-status-pending:%' THEN
      tenant_id := split_part(OLD."key", ':', 2);
      order_id := substring(OLD."key" from '^storefront-order-status-pending:[^:]+:(.+)$');
      UPDATE "StorefrontSyncOutbox"
      SET "status" = 'DELIVERED', "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "tenantId" = tenant_id AND "eventType" = 'STOREFRONT_ORDER_STATUS' AND "aggregateId" = order_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."key" NOT LIKE 'storefront-order-status-pending:%' THEN RETURN NEW; END IF;
  tenant_id := split_part(NEW."key", ':', 2);
  order_id := substring(NEW."key" from '^storefront-order-status-pending:[^:]+:(.+)$');
  IF order_id IS NULL OR NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "id" = tenant_id) THEN RETURN NEW; END IF;

  BEGIN
    event_payload := NEW."value"::jsonb;
  EXCEPTION WHEN others THEN
    event_payload := jsonb_build_object('orderId', order_id, 'queuedAt', CURRENT_TIMESTAMP);
  END;

  INSERT INTO "StorefrontSyncOutbox" (
    "id", "tenantId", "aggregateId", "eventType", "payload", "status", "attempts",
    "nextAttemptAt", "createdAt", "updatedAt"
  ) VALUES (
    md5(NEW."key" || clock_timestamp()::text || random()::text), tenant_id, order_id,
    'STOREFRONT_ORDER_STATUS', event_payload, 'PENDING', 1,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("tenantId", "eventType", "aggregateId") DO UPDATE SET
    "payload" = EXCLUDED."payload",
    "status" = 'PENDING',
    "attempts" = "StorefrontSyncOutbox"."attempts" + 1,
    "nextAttemptAt" = CURRENT_TIMESTAMP,
    "lastError" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "SystemSetting_storefront_outbox_bridge" ON "SystemSetting";
CREATE TRIGGER "SystemSetting_storefront_outbox_bridge"
AFTER INSERT OR UPDATE OR DELETE ON "SystemSetting"
FOR EACH ROW
EXECUTE FUNCTION mirror_storefront_status_setting_to_outbox();
