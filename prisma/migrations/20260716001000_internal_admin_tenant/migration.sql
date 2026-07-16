-- The platform owner uses a dedicated internal tenant for ERP/POS acceptance tests.
-- It must never be mixed into customer licensing or customer statistics.
ALTER TABLE "Tenant"
ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Tenant_isInternal_idx" ON "Tenant"("isInternal");
