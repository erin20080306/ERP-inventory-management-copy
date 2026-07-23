-- Keep the product catalog schema compatible with ecommerce publishing controls.
-- IF NOT EXISTS makes this safe for databases that were repaired at runtime first.
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Product_tenantId_isPublished_idx"
ON "Product"("tenantId", "isPublished");
