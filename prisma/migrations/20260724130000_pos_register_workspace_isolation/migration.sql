CREATE TYPE "PosRegisterMode" AS ENUM ('POS_RETAIL', 'POS_RESTAURANT', 'POS_MEDICAL');

ALTER TABLE "PosRegister"
ADD COLUMN "mode" "PosRegisterMode" NOT NULL DEFAULT 'POS_RETAIL';

UPDATE "PosRegister"
SET "mode" = 'POS_MEDICAL'
WHERE "code" LIKE 'MED-%';

UPDATE "PosRegister" AS register
SET "mode" = 'POS_RESTAURANT'
FROM "Tenant" AS tenant
WHERE register."tenantId" = tenant."id"
  AND tenant."businessMode" = 'POS_RESTAURANT'
  AND tenant."isInternal" = FALSE;

INSERT INTO "PosRegister" (
  "id",
  "tenantId",
  "warehouseId",
  "code",
  "name",
  "mode",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'rest_' || md5(tenant."id"),
  tenant."id",
  warehouse."id",
  'REST-01',
  '餐飲櫃台',
  'POS_RESTAURANT',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
CROSS JOIN LATERAL (
  SELECT candidate."id"
  FROM "Warehouse" AS candidate
  WHERE candidate."tenantId" = tenant."id"
    AND candidate."isActive" = TRUE
  ORDER BY
    CASE WHEN candidate."code" IN ('WH01', 'WH-MAIN') THEN 0 ELSE 1 END,
    candidate."createdAt" ASC
  LIMIT 1
) AS warehouse
WHERE tenant."isInternal" = TRUE
ON CONFLICT ("tenantId", "code") DO UPDATE
SET
  "mode" = 'POS_RESTAURANT',
  "name" = EXCLUDED."name",
  "warehouseId" = EXCLUDED."warehouseId",
  "isActive" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

CREATE INDEX "PosRegister_tenantId_mode_isActive_idx"
ON "PosRegister"("tenantId", "mode", "isActive");
