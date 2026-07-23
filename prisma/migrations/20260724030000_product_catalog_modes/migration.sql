-- 各營運模式使用獨立商品目錄；舊目錄仍保留供歷史單據引用。
ALTER TABLE "Product" ADD COLUMN "catalogMode" TEXT;
ALTER TABLE "Product" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- 既有自訂商品先歸入租戶目前模式，確保升級後仍可見。
UPDATE "Product" AS product
SET "catalogMode" = CASE
  WHEN tenant."businessMode" = 'ECOMMERCE' THEN 'ECOMMERCE'
  WHEN tenant."businessMode" = 'POS_RESTAURANT' THEN 'POS_RESTAURANT'
  WHEN tenant."businessMode" IN ('POS', 'POS_RETAIL') THEN 'POS_RETAIL'
  ELSE 'ERP'
END
FROM "Tenant" AS tenant
WHERE tenant."id" = product."tenantId";

-- 系統示範商品依原生分類歸回正確目錄，修正曾切換模式的租戶。
UPDATE "Product" AS product
SET "catalogMode" = 'ERP'
FROM "ProductCategory" AS category
WHERE category."id" = product."categoryId"
  AND category."code" = 'ERP-DEMO';

UPDATE "Product" AS product
SET "catalogMode" = 'POS_RETAIL'
FROM "ProductCategory" AS category
WHERE category."id" = product."categoryId"
  AND category."code" IN ('RETAIL-HOT', 'RETAIL-AROMA', 'RETAIL-ACC', 'RETAIL-LIFE');

UPDATE "Product" AS product
SET "catalogMode" = 'POS_RESTAURANT'
FROM "ProductCategory" AS category
WHERE category."id" = product."categoryId"
  AND category."code" IN ('MEAL', 'SNACK', 'DRINK');

UPDATE "Product" AS product
SET "catalogMode" = 'ECOMMERCE'
FROM "ProductCategory" AS category
WHERE category."id" = product."categoryId"
  AND category."code" IN ('EC-TOP', 'EC-BOTTOM', 'EC-KNIT', 'EC-ACC', 'EC-DRESS', 'EC-SHOES');

CREATE INDEX "Product_tenantId_catalogMode_idx" ON "Product"("tenantId", "catalogMode");
CREATE INDEX "Product_tenantId_isArchived_idx" ON "Product"("tenantId", "isArchived");
