-- 先替尚未建立公司設定的醫美租戶建立設定，確保每個租戶都有自己的官網。
INSERT INTO "CompanySetting" ("id", "tenantId", "name", "currency", "storeName", "storeSlug", "smtpSecure", "updatedAt")
SELECT
  CONCAT('medical-site-', tenant."id"),
  tenant."id",
  tenant."name",
  'TWD',
  tenant."name",
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "CompanySetting" AS existing
      WHERE existing."storeSlug" = CONCAT('medical-', LOWER(tenant."id"))
        AND existing."tenantId" <> tenant."id"
    )
      THEN CONCAT('medical-', LOWER(tenant."id"), '-', SUBSTRING(MD5(tenant."id"), 1, 8))
    ELSE CONCAT('medical-', LOWER(tenant."id"))
  END,
  TRUE,
  NOW()
FROM "Tenant" AS tenant
WHERE tenant."businessMode" = 'POS_MEDICAL'
  AND NOT EXISTS (
    SELECT 1
    FROM "CompanySetting" AS settings
    WHERE settings."tenantId" = tenant."id"
  );

-- 每個既有醫美租戶選一筆公司設定補上官網代碼；避免歷史重複設定列觸發網址唯一鍵衝突。
WITH chosen_settings AS (
  SELECT DISTINCT ON (settings."tenantId")
    settings."id",
    settings."tenantId"
  FROM "CompanySetting" AS settings
  INNER JOIN "Tenant" AS tenant ON tenant."id" = settings."tenantId"
  WHERE tenant."businessMode" = 'POS_MEDICAL'
  ORDER BY settings."tenantId", settings."id"
)
UPDATE "CompanySetting" AS settings
SET
  "storeName" = COALESCE(NULLIF(settings."storeName", ''), NULLIF(settings."name", ''), tenant."name"),
  "storeSlug" = COALESCE(
    NULLIF(settings."storeSlug", ''),
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM "CompanySetting" AS existing
        WHERE existing."storeSlug" = CONCAT('medical-', LOWER(tenant."id"))
          AND existing."tenantId" <> tenant."id"
      )
        THEN CONCAT('medical-', LOWER(tenant."id"), '-', SUBSTRING(MD5(settings."id"), 1, 8))
      ELSE CONCAT('medical-', LOWER(tenant."id"))
    END
  )
FROM "Tenant" AS tenant, chosen_settings
WHERE settings."id" = chosen_settings."id"
  AND settings."tenantId" = tenant."id"
  AND (settings."storeName" IS NULL OR settings."storeName" = '' OR settings."storeSlug" IS NULL OR settings."storeSlug" = '');
