CREATE TABLE "PlanInquiry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "lineId" TEXT,
  "businessMode" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "billing" TEXT NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "sourceIpHash" TEXT,
  "notificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "notificationError" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "contactedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanInquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LicensePayment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "billing" TEXT NOT NULL,
  "quotedAmount" DECIMAL(12,2) NOT NULL,
  "paidAmount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "paymentReference" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "confirmedByUserId" TEXT NOT NULL,
  "notes" TEXT,
  "recordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LicensePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanInquiry_status_createdAt_idx" ON "PlanInquiry"("status", "createdAt");
CREATE INDEX "PlanInquiry_email_createdAt_idx" ON "PlanInquiry"("email", "createdAt");
CREATE INDEX "PlanInquiry_tenantId_createdAt_idx" ON "PlanInquiry"("tenantId", "createdAt");
CREATE UNIQUE INDEX "LicensePayment_recordHash_key" ON "LicensePayment"("recordHash");
CREATE UNIQUE INDEX "LicensePayment_tenantId_paymentReference_key" ON "LicensePayment"("tenantId", "paymentReference");
CREATE INDEX "LicensePayment_tenantId_createdAt_idx" ON "LicensePayment"("tenantId", "createdAt");
CREATE INDEX "LicensePayment_paidAt_idx" ON "LicensePayment"("paidAt");

ALTER TABLE "PlanInquiry"
  ADD CONSTRAINT "PlanInquiry_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LicensePayment"
  ADD CONSTRAINT "LicensePayment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
