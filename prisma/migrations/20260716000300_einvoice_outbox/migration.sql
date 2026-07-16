CREATE TYPE "ElectronicInvoiceProvider" AS ENUM ('MOCK', 'TURNKEY', 'VAC');
CREATE TYPE "ElectronicInvoiceStatus" AS ENUM ('QUEUED', 'ISSUED', 'FAILED', 'VOIDED');
CREATE TYPE "ElectronicInvoiceEventType" AS ENUM ('ISSUE', 'VOID', 'ALLOWANCE');
CREATE TYPE "ElectronicInvoiceEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "ElectronicInvoice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "posSaleId" TEXT NOT NULL,
  "provider" "ElectronicInvoiceProvider" NOT NULL,
  "status" "ElectronicInvoiceStatus" NOT NULL DEFAULT 'QUEUED',
  "mode" TEXT NOT NULL,
  "invoiceNumber" TEXT,
  "randomCode" TEXT,
  "buyerTaxId" TEXT,
  "carrierType" TEXT,
  "carrierId" TEXT,
  "donationCode" TEXT,
  "printMark" BOOLEAN NOT NULL DEFAULT false,
  "issuedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ElectronicInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ElectronicInvoiceEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "type" "ElectronicInvoiceEventType" NOT NULL,
  "status" "ElectronicInvoiceEventStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "ElectronicInvoiceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectronicInvoice_posSaleId_key" ON "ElectronicInvoice"("posSaleId");
CREATE INDEX "ElectronicInvoice_tenantId_status_createdAt_idx" ON "ElectronicInvoice"("tenantId", "status", "createdAt");
CREATE INDEX "ElectronicInvoice_tenantId_invoiceNumber_idx" ON "ElectronicInvoice"("tenantId", "invoiceNumber");
CREATE INDEX "ElectronicInvoiceEvent_tenantId_status_nextRetryAt_idx" ON "ElectronicInvoiceEvent"("tenantId", "status", "nextRetryAt");
CREATE INDEX "ElectronicInvoiceEvent_invoiceId_createdAt_idx" ON "ElectronicInvoiceEvent"("invoiceId", "createdAt");

ALTER TABLE "ElectronicInvoice" ADD CONSTRAINT "ElectronicInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectronicInvoice" ADD CONSTRAINT "ElectronicInvoice_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectronicInvoiceEvent" ADD CONSTRAINT "ElectronicInvoiceEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectronicInvoiceEvent" ADD CONSTRAINT "ElectronicInvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ElectronicInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
