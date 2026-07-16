ALTER TABLE "Tenant"
ADD COLUMN "companyCode" TEXT,
ADD COLUMN "discoveryServerUrl" TEXT,
ADD COLUMN "discoveryCaCertificate" TEXT,
ADD COLUMN "discoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "discoveryVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discoveryUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Tenant_companyCode_key" ON "Tenant"("companyCode");
