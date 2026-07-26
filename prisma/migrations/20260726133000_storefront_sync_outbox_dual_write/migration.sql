CREATE TABLE IF NOT EXISTS "StorefrontSyncOutbox" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL DEFAULT 'SALES_ORDER',
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT 'STOREFRONT_ORDER_STATUS',
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorefrontSyncOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StorefrontSyncOutbox_tenant_event_aggregate_key"
ON "StorefrontSyncOutbox"("tenantId", "eventType", "aggregateId");

CREATE INDEX IF NOT EXISTS "StorefrontSyncOutbox_status_nextAttemptAt_idx"
ON "StorefrontSyncOutbox"("status", "nextAttemptAt");

CREATE INDEX IF NOT EXISTS "StorefrontSyncOutbox_tenant_createdAt_idx"
ON "StorefrontSyncOutbox"("tenantId", "createdAt");

CREATE OR REPLACE FUNCTION mirror_storefront_status_setting_to_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  source_key TEXT;
  source_value TEXT;
  key_parts TEXT[];
  tenant_id TEXT;
  order_id TEXT;
BEGIN
  source_key := CASE WHEN TG_OP = 'DELETE' THEN OLD."key" ELSE NEW."key" END;
  IF source_key NOT LIKE 'storefront-order-status-pending:%' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  key_parts := string_to_array(source_key, ':');
  tenant_id := COALESCE(key_parts[3], '');
  order_id := COALESCE(array_to_string(key_parts[4:array_length(key_parts, 1)], ':'), '');
  IF tenant_id = '' OR order_id = '' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE "StorefrontSyncOutbox"
    SET "status" = 'DELIVERED',
        "deliveredAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tenantId" = tenant_id
      AND "eventType" = 'STOREFRONT_ORDER_STATUS'
      AND "aggregateId" = order_id;
    RETURN OLD;
  END IF;

  source_value := NEW."value";
  INSERT INTO "StorefrontSyncOutbox" (
    "id",
    "tenantId",
    "aggregateType",
    "aggregateId",
    "eventType",
    "payload",
    "status",
    "attempts",
    "nextAttemptAt",
    "lastError",
    "createdAt",
    "updatedAt"
  ) VALUES (
    md5(source_key),
    tenant_id,
    'SALES_ORDER',
    order_id,
    'STOREFRONT_ORDER_STATUS',
    jsonb_build_object(
      'legacyKey', source_key,
      'legacyValue', source_value,
      'mirroredAt', CURRENT_TIMESTAMP
    ),
    'PENDING',
    0,
    CURRENT_TIMESTAMP,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("tenantId", "eventType", "aggregateId")
  DO UPDATE SET
    "payload" = EXCLUDED."payload",
    "status" = 'PENDING',
    "nextAttemptAt" = CURRENT_TIMESTAMP,
    "lastError" = NULL,
    "deliveredAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "SystemSetting_storefront_outbox_bridge" ON "SystemSetting";
CREATE TRIGGER "SystemSetting_storefront_outbox_bridge"
AFTER INSERT OR UPDATE OR DELETE ON "SystemSetting"
FOR EACH ROW
EXECUTE FUNCTION mirror_storefront_status_setting_to_outbox();
