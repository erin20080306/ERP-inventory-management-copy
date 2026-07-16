-- Tenant-level licensing, device seats, tamper-evident events, and legal consent.
ALTER TABLE "Tenant"
  ADD COLUMN "businessMode" TEXT NOT NULL DEFAULT 'ERP',
  ADD COLUMN "licensePlan" TEXT,
  ADD COLUMN "licenseBilling" TEXT,
  ADD COLUMN "licenseStatus" TEXT NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "licenseSeatLimit" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "licenseActivatedAt" TIMESTAMP(3),
  ADD COLUMN "licenseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "licenseMaintenanceEnd" TIMESTAMP(3),
  ADD COLUMN "licenseKeyHash" TEXT,
  ADD COLUMN "licenseKeyPrefix" TEXT,
  ADD COLUMN "licenseVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "licenseUpdatedAt" TIMESTAMP(3);

ALTER TABLE "User"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3);

ALTER TABLE "AuditLog"
  ADD COLUMN "tenantId" TEXT,
  ADD COLUMN "previousHash" TEXT,
  ADD COLUMN "entryHash" TEXT,
  ADD COLUMN "integrityVersion" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "AuditLog_entryHash_key" ON "AuditLog"("entryHash");
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Tenant_licenseKeyHash_key" ON "Tenant"("licenseKeyHash");

CREATE TABLE "LicenseDevice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deviceHash" TEXT NOT NULL,
  "displayName" TEXT,
  "platform" TEXT,
  "appVersion" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastIp" TEXT,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "LicenseDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LicenseDevice_tenantId_deviceHash_key" ON "LicenseDevice"("tenantId", "deviceHash");
CREATE INDEX "LicenseDevice_tenantId_revokedAt_idx" ON "LicenseDevice"("tenantId", "revokedAt");
CREATE INDEX "LicenseDevice_lastSeenAt_idx" ON "LicenseDevice"("lastSeenAt");

CREATE TABLE "LicenseEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "payload" JSONB,
  "previousHash" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LicenseEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LicenseEvent_eventHash_key" ON "LicenseEvent"("eventHash");
CREATE INDEX "LicenseEvent_tenantId_createdAt_idx" ON "LicenseEvent"("tenantId", "createdAt");

ALTER TABLE "LicenseDevice"
  ADD CONSTRAINT "LicenseDevice_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LicenseEvent"
  ADD CONSTRAINT "LicenseEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OfflineLicenseLease" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "remoteTenantId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "signature" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  CONSTRAINT "OfflineLicenseLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfflineLicenseLease_tenantId_key" ON "OfflineLicenseLease"("tenantId");
CREATE INDEX "OfflineLicenseLease_expiresAt_idx" ON "OfflineLicenseLease"("expiresAt");
ALTER TABLE "OfflineLicenseLease" ADD CONSTRAINT "OfflineLicenseLease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing receivable/payable code already uses PARTIAL and PAID; make the DB enum match.
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "PayableStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "PayableStatus" ADD VALUE IF NOT EXISTS 'PAID';

CREATE TYPE "PosShiftStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "PosSaleStatus" AS ENUM ('COMPLETED', 'VOIDED', 'REFUNDED');

CREATE TABLE "PosRegister" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosRegister_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosShift" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "registerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "PosShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openingCash" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "expectedCash" DECIMAL(18,2),
  "closingCash" DECIMAL(18,2),
  "difference" DECIMAL(18,2),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "PosShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosSale" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "registerId" TEXT NOT NULL,
  "customerId" TEXT,
  "salesOrderId" TEXT,
  "number" TEXT NOT NULL,
  "status" "PosSaleStatus" NOT NULL DEFAULT 'COMPLETED',
  "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "changeDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "receiptNo" TEXT,
  "voidReason" TEXT,
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosSaleItem" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "PosSaleItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosPayment" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosRegister_tenantId_code_key" ON "PosRegister"("tenantId", "code");
CREATE INDEX "PosRegister_tenantId_isActive_idx" ON "PosRegister"("tenantId", "isActive");
CREATE INDEX "PosRegister_warehouseId_idx" ON "PosRegister"("warehouseId");
CREATE INDEX "PosShift_tenantId_status_idx" ON "PosShift"("tenantId", "status");
CREATE INDEX "PosShift_registerId_status_idx" ON "PosShift"("registerId", "status");
CREATE INDEX "PosShift_userId_status_idx" ON "PosShift"("userId", "status");
CREATE INDEX "PosShift_openedAt_idx" ON "PosShift"("openedAt");
CREATE UNIQUE INDEX "PosSale_salesOrderId_key" ON "PosSale"("salesOrderId");
CREATE UNIQUE INDEX "PosSale_tenantId_number_key" ON "PosSale"("tenantId", "number");
CREATE INDEX "PosSale_tenantId_createdAt_idx" ON "PosSale"("tenantId", "createdAt");
CREATE INDEX "PosSale_shiftId_createdAt_idx" ON "PosSale"("shiftId", "createdAt");
CREATE INDEX "PosSale_registerId_createdAt_idx" ON "PosSale"("registerId", "createdAt");
CREATE INDEX "PosSale_status_idx" ON "PosSale"("status");
CREATE INDEX "PosSaleItem_saleId_idx" ON "PosSaleItem"("saleId");
CREATE INDEX "PosSaleItem_productId_idx" ON "PosSaleItem"("productId");
CREATE INDEX "PosPayment_saleId_idx" ON "PosPayment"("saleId");
CREATE INDEX "PosPayment_method_createdAt_idx" ON "PosPayment"("method", "createdAt");

ALTER TABLE "PosRegister" ADD CONSTRAINT "PosRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosRegister" ADD CONSTRAINT "PosRegister_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
