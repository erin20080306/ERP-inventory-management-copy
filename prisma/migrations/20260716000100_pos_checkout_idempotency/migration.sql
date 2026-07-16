ALTER TABLE "PosSale"
ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "PosSale_tenantId_clientRequestId_key"
ON "PosSale"("tenantId", "clientRequestId");
