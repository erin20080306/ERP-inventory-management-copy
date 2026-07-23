ALTER TABLE "Product"
ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Product_tenantId_isPublished_idx"
ON "Product"("tenantId", "isPublished");
