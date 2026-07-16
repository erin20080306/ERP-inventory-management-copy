ALTER TYPE "ElectronicInvoiceProvider" ADD VALUE IF NOT EXISTS 'VAN';

ALTER TABLE "ElectronicInvoiceEvent"
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "providerResponse" JSONB,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "ElectronicInvoiceEvent_status_processingStartedAt_idx"
  ON "ElectronicInvoiceEvent"("status", "processingStartedAt");
