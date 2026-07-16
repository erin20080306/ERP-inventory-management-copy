-- Existing device records were created by the Docker host installer, so migrate them as SERVER.
ALTER TABLE "LicenseDevice"
  ADD COLUMN "deviceRole" TEXT NOT NULL DEFAULT 'SERVER',
  ADD COLUMN "devicePublicKey" TEXT;

-- New records default to workstation seats unless the host explicitly requests SERVER.
ALTER TABLE "LicenseDevice" ALTER COLUMN "deviceRole" SET DEFAULT 'WORKSTATION';

CREATE INDEX "LicenseDevice_tenantId_deviceRole_revokedAt_idx"
  ON "LicenseDevice"("tenantId", "deviceRole", "revokedAt");
