-- AlterTable
ALTER TABLE "CompanySetting" ADD COLUMN "storeName" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "storeSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CompanySetting_storeSlug_key" ON "CompanySetting"("storeSlug");
