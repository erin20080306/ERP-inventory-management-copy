-- 智慧補貨預測所需欄位：商品的前置期／補貨週期／偏好供應商，及供應商的預設前置期。
-- 皆為可空欄位，對既有資料無破壞性；未設定時由系統依歷史推算。

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "leadTimeDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "reorderReviewDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "preferredSupplierId" TEXT;

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "leadTimeDays" INTEGER;

CREATE INDEX IF NOT EXISTS "Product_tenantId_preferredSupplierId_idx"
ON "Product"("tenantId", "preferredSupplierId");

-- 偏好供應商外鍵（供應商刪除時置空，不連帶刪除商品）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Product_preferredSupplierId_fkey'
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_preferredSupplierId_fkey"
      FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
