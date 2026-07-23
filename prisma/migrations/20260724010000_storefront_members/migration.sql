-- 電商官網會員與 ERP 客戶主檔一對一連結；登入憑證不放在一般客戶欄位。
CREATE TABLE "StorefrontMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorefrontMemberSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontMemberSession_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "StorefrontPaymentMethod" AS ENUM ('CARD', 'MOBILE', 'TRANSFER');
CREATE TYPE "StorefrontPaymentStatus" AS ENUM ('AWAITING_TRANSFER', 'GATEWAY_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "StorefrontPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "StorefrontPaymentMethod" NOT NULL,
    "status" "StorefrontPaymentStatus" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "provider" TEXT,
    "providerReference" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontPayment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CompanySetting"
ADD COLUMN "storeTransferBankName" TEXT,
ADD COLUMN "storeTransferAccountName" TEXT,
ADD COLUMN "storeTransferAccountNumber" TEXT;

CREATE UNIQUE INDEX "StorefrontMember_customerId_key" ON "StorefrontMember"("customerId");
CREATE UNIQUE INDEX "StorefrontMember_tenantId_email_key" ON "StorefrontMember"("tenantId", "email");
CREATE INDEX "StorefrontMember_tenantId_isActive_idx" ON "StorefrontMember"("tenantId", "isActive");
CREATE INDEX "StorefrontMember_tenantId_createdAt_idx" ON "StorefrontMember"("tenantId", "createdAt");
CREATE UNIQUE INDEX "StorefrontMemberSession_tokenHash_key" ON "StorefrontMemberSession"("tokenHash");
CREATE INDEX "StorefrontMemberSession_tenantId_expiresAt_idx" ON "StorefrontMemberSession"("tenantId", "expiresAt");
CREATE INDEX "StorefrontMemberSession_memberId_expiresAt_idx" ON "StorefrontMemberSession"("memberId", "expiresAt");
CREATE UNIQUE INDEX "StorefrontPayment_orderId_key" ON "StorefrontPayment"("orderId");
CREATE INDEX "StorefrontPayment_tenantId_status_createdAt_idx" ON "StorefrontPayment"("tenantId", "status", "createdAt");
CREATE INDEX "StorefrontPayment_tenantId_method_createdAt_idx" ON "StorefrontPayment"("tenantId", "method", "createdAt");

ALTER TABLE "StorefrontMember"
ADD CONSTRAINT "StorefrontMember_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorefrontMember"
ADD CONSTRAINT "StorefrontMember_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorefrontMemberSession"
ADD CONSTRAINT "StorefrontMemberSession_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorefrontMemberSession"
ADD CONSTRAINT "StorefrontMemberSession_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "StorefrontMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorefrontPayment"
ADD CONSTRAINT "StorefrontPayment_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorefrontPayment"
ADD CONSTRAINT "StorefrontPayment_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
