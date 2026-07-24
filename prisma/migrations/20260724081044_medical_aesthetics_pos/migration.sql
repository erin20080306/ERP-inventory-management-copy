-- AlterTable
ALTER TABLE "ElectronicInvoiceEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "trackInventory" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MedicalService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "bodyArea" TEXT,
    "equipmentName" TEXT,
    "consentRequired" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalServiceConsumable" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalServiceConsumable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalAppointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "posSaleId" TEXT,
    "number" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "practitionerName" TEXT NOT NULL,
    "room" TEXT,
    "notes" TEXT,
    "consentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalTreatmentPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "validDays" INTEGER NOT NULL DEFAULT 365,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalTreatmentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalPackagePurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "posSaleId" TEXT,
    "number" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "remainingSessions" INTEGER NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalPackagePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalWallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalWalletTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "title" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "signedName" TEXT,
    "responses" JSONB,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalTreatmentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "packagePurchaseId" TEXT,
    "practitionerName" TEXT NOT NULL,
    "treatmentNotes" TEXT,
    "beforePhotoUrl" TEXT,
    "afterPhotoUrl" TEXT,
    "deferredRevenueRecognized" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalTreatmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posSaleId" TEXT,
    "walletTransactionId" TEXT,
    "appointmentId" TEXT,
    "customerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientIdentity" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "medicalRecordNo" TEXT,
    "practitionerName" TEXT,
    "department" TEXT NOT NULL DEFAULT '醫學美容',
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medicalItems" JSONB NOT NULL,
    "nonMedicalItems" JSONB,
    "medicalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "nonMedicalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "voidReason" TEXT,
    "issuedByName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicalService_productId_key" ON "MedicalService"("productId");

-- CreateIndex
CREATE INDEX "MedicalService_tenantId_isActive_category_idx" ON "MedicalService"("tenantId", "isActive", "category");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalService_tenantId_code_key" ON "MedicalService"("tenantId", "code");

-- CreateIndex
CREATE INDEX "MedicalServiceConsumable_productId_idx" ON "MedicalServiceConsumable"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalServiceConsumable_serviceId_productId_key" ON "MedicalServiceConsumable"("serviceId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalAppointment_posSaleId_key" ON "MedicalAppointment"("posSaleId");

-- CreateIndex
CREATE INDEX "MedicalAppointment_tenantId_startAt_status_idx" ON "MedicalAppointment"("tenantId", "startAt", "status");

-- CreateIndex
CREATE INDEX "MedicalAppointment_customerId_startAt_idx" ON "MedicalAppointment"("customerId", "startAt");

-- CreateIndex
CREATE INDEX "MedicalAppointment_serviceId_startAt_idx" ON "MedicalAppointment"("serviceId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalAppointment_tenantId_number_key" ON "MedicalAppointment"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalTreatmentPackage_productId_key" ON "MedicalTreatmentPackage"("productId");

-- CreateIndex
CREATE INDEX "MedicalTreatmentPackage_tenantId_isActive_idx" ON "MedicalTreatmentPackage"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "MedicalTreatmentPackage_serviceId_idx" ON "MedicalTreatmentPackage"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalTreatmentPackage_tenantId_code_key" ON "MedicalTreatmentPackage"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalPackagePurchase_posSaleId_key" ON "MedicalPackagePurchase"("posSaleId");

-- CreateIndex
CREATE INDEX "MedicalPackagePurchase_tenantId_status_validUntil_idx" ON "MedicalPackagePurchase"("tenantId", "status", "validUntil");

-- CreateIndex
CREATE INDEX "MedicalPackagePurchase_customerId_status_idx" ON "MedicalPackagePurchase"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalPackagePurchase_tenantId_number_key" ON "MedicalPackagePurchase"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalWallet_customerId_key" ON "MedicalWallet"("customerId");

-- CreateIndex
CREATE INDEX "MedicalWallet_tenantId_updatedAt_idx" ON "MedicalWallet"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "MedicalWalletTransaction_walletId_createdAt_idx" ON "MedicalWalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "MedicalWalletTransaction_tenantId_type_createdAt_idx" ON "MedicalWalletTransaction"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalWalletTransaction_tenantId_number_key" ON "MedicalWalletTransaction"("tenantId", "number");

-- CreateIndex
CREATE INDEX "MedicalConsent_tenantId_status_createdAt_idx" ON "MedicalConsent"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MedicalConsent_customerId_createdAt_idx" ON "MedicalConsent"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "MedicalConsent_appointmentId_idx" ON "MedicalConsent"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalTreatmentRecord_appointmentId_key" ON "MedicalTreatmentRecord"("appointmentId");

-- CreateIndex
CREATE INDEX "MedicalTreatmentRecord_tenantId_completedAt_idx" ON "MedicalTreatmentRecord"("tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "MedicalTreatmentRecord_customerId_completedAt_idx" ON "MedicalTreatmentRecord"("customerId", "completedAt");

-- CreateIndex
CREATE INDEX "MedicalTreatmentRecord_serviceId_completedAt_idx" ON "MedicalTreatmentRecord"("serviceId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalReceipt_posSaleId_key" ON "MedicalReceipt"("posSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalReceipt_walletTransactionId_key" ON "MedicalReceipt"("walletTransactionId");

-- CreateIndex
CREATE INDEX "MedicalReceipt_tenantId_issuedAt_status_idx" ON "MedicalReceipt"("tenantId", "issuedAt", "status");

-- CreateIndex
CREATE INDEX "MedicalReceipt_customerId_issuedAt_idx" ON "MedicalReceipt"("customerId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalReceipt_tenantId_number_key" ON "MedicalReceipt"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "MedicalService" ADD CONSTRAINT "MedicalService_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalService" ADD CONSTRAINT "MedicalService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalServiceConsumable" ADD CONSTRAINT "MedicalServiceConsumable_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MedicalService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalServiceConsumable" ADD CONSTRAINT "MedicalServiceConsumable_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAppointment" ADD CONSTRAINT "MedicalAppointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAppointment" ADD CONSTRAINT "MedicalAppointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAppointment" ADD CONSTRAINT "MedicalAppointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MedicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAppointment" ADD CONSTRAINT "MedicalAppointment_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatmentPackage" ADD CONSTRAINT "MedicalTreatmentPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatmentPackage" ADD CONSTRAINT "MedicalTreatmentPackage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatmentPackage" ADD CONSTRAINT "MedicalTreatmentPackage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MedicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalPackagePurchase" ADD CONSTRAINT "MedicalPackagePurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalPackagePurchase" ADD CONSTRAINT "MedicalPackagePurchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalPackagePurchase" ADD CONSTRAINT "MedicalPackagePurchase_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MedicalTreatmentPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalPackagePurchase" ADD CONSTRAINT "MedicalPackagePurchase_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalWallet" ADD CONSTRAINT "MedicalWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalWallet" ADD CONSTRAINT "MedicalWallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalWalletTransaction" ADD CONSTRAINT "MedicalWalletTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalWalletTransaction" ADD CONSTRAINT "MedicalWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "MedicalWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalConsent" ADD CONSTRAINT "MedicalConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalConsent" ADD CONSTRAINT "MedicalConsent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalConsent" ADD CONSTRAINT "MedicalConsent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MedicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalConsent" ADD CONSTRAINT "MedicalConsent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "MedicalAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatmentRecord" ADD CONSTRAINT "MedicalTreatmentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatmentRecord" ADD CONSTRAINT "MedicalTreatmentRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "MedicalAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatmentRecord" ADD CONSTRAINT "MedicalTreatmentRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatmentRecord" ADD CONSTRAINT "MedicalTreatmentRecord_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MedicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatmentRecord" ADD CONSTRAINT "MedicalTreatmentRecord_packagePurchaseId_fkey" FOREIGN KEY ("packagePurchaseId") REFERENCES "MedicalPackagePurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalReceipt" ADD CONSTRAINT "MedicalReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalReceipt" ADD CONSTRAINT "MedicalReceipt_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalReceipt" ADD CONSTRAINT "MedicalReceipt_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "MedicalWalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalReceipt" ADD CONSTRAINT "MedicalReceipt_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "MedicalAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalReceipt" ADD CONSTRAINT "MedicalReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
