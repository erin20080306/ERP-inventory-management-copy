CREATE TYPE "PosCashMovementType" AS ENUM ('PAID_IN', 'PAID_OUT', 'SAFE_DROP');
CREATE TYPE "PosOperationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "PosHeldSaleStatus" AS ENUM ('HELD', 'RESUMED', 'CANCELLED');

CREATE TABLE "PosCashMovement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "registerId" TEXT NOT NULL,
  "type" "PosCashMovementType" NOT NULL,
  "status" "PosOperationStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "PosCashMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosHeldSale" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "registerId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" "PosHeldSaleStatus" NOT NULL DEFAULT 'HELD',
  "payload" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "resumedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resumedAt" TIMESTAMP(3),
  CONSTRAINT "PosHeldSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosCartDraft" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosCartDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PosCashMovement_tenantId_status_requestedAt_idx" ON "PosCashMovement"("tenantId", "status", "requestedAt");
CREATE INDEX "PosCashMovement_shiftId_status_idx" ON "PosCashMovement"("shiftId", "status");
CREATE INDEX "PosCashMovement_registerId_requestedAt_idx" ON "PosCashMovement"("registerId", "requestedAt");
CREATE INDEX "PosHeldSale_tenantId_status_createdAt_idx" ON "PosHeldSale"("tenantId", "status", "createdAt");
CREATE INDEX "PosHeldSale_shiftId_status_idx" ON "PosHeldSale"("shiftId", "status");
CREATE INDEX "PosHeldSale_registerId_status_idx" ON "PosHeldSale"("registerId", "status");
CREATE UNIQUE INDEX "PosCartDraft_tenantId_shiftId_userId_key" ON "PosCartDraft"("tenantId", "shiftId", "userId");
CREATE INDEX "PosCartDraft_tenantId_updatedAt_idx" ON "PosCartDraft"("tenantId", "updatedAt");

ALTER TABLE "PosCashMovement" ADD CONSTRAINT "PosCashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosCashMovement" ADD CONSTRAINT "PosCashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosCashMovement" ADD CONSTRAINT "PosCashMovement_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosHeldSale" ADD CONSTRAINT "PosHeldSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosHeldSale" ADD CONSTRAINT "PosHeldSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosHeldSale" ADD CONSTRAINT "PosHeldSale_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosCartDraft" ADD CONSTRAINT "PosCartDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosCartDraft" ADD CONSTRAINT "PosCartDraft_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
