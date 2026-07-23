-- CreateEnum
CREATE TYPE "FixedAssetDepreciationStatus" AS ENUM ('CONFIRMED', 'POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "FixedAssetDepreciation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fixedAssetId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "depreciationDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "openingBookValue" DECIMAL(18,2) NOT NULL,
    "closingBookValue" DECIMAL(18,2) NOT NULL,
    "method" "DepreciationMethod" NOT NULL,
    "expenseAccountCode" TEXT NOT NULL,
    "accumulatedAccountCode" TEXT NOT NULL,
    "status" "FixedAssetDepreciationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "journalEntryId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetDepreciation_journalEntryId_key" ON "FixedAssetDepreciation"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetDepreciation_tenantId_fixedAssetId_period_key" ON "FixedAssetDepreciation"("tenantId", "fixedAssetId", "period");

-- CreateIndex
CREATE INDEX "FixedAssetDepreciation_tenantId_depreciationDate_idx" ON "FixedAssetDepreciation"("tenantId", "depreciationDate");

-- CreateIndex
CREATE INDEX "FixedAssetDepreciation_tenantId_status_idx" ON "FixedAssetDepreciation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FixedAssetDepreciation_fixedAssetId_idx" ON "FixedAssetDepreciation"("fixedAssetId");

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
