CREATE TYPE "PosOfferKind" AS ENUM ('PERCENT', 'AMOUNT');
CREATE TYPE "PosApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONSUMED', 'EXPIRED');
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'REFUND', 'ADJUST');

ALTER TABLE "Customer" ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "loyaltyTier" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "PosSale" ADD COLUMN "promotionId" TEXT;
ALTER TABLE "PosSale" ADD COLUMN "promotionDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PosSale" ADD COLUMN "couponDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PosSale" ADD COLUMN "pointsDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PosSale" ADD COLUMN "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PosSale" ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PosPromotion" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "kind" "PosOfferKind" NOT NULL, "value" DECIMAL(18,2) NOT NULL, "minSpend" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 0, "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosPromotion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PosCoupon" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "kind" "PosOfferKind" NOT NULL, "value" DECIMAL(18,2) NOT NULL, "minSpend" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "maxDiscount" DECIMAL(18,2), "maxUses" INTEGER, "perCustomerLimit" INTEGER NOT NULL DEFAULT 1, "usedCount" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosCoupon_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PosCouponRedemption" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "couponId" TEXT NOT NULL, "saleId" TEXT NOT NULL, "customerId" TEXT,
  "amount" DECIMAL(18,2) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosCouponRedemption_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PosManagerApproval" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "kind" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
  "status" "PosApprovalStatus" NOT NULL DEFAULT 'PENDING', "payload" JSONB NOT NULL, "requestedById" TEXT NOT NULL,
  "decidedById" TEXT, "saleId" TEXT, "reason" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3),
  CONSTRAINT "PosManagerApproval_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomerLoyaltyTransaction" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "saleId" TEXT NOT NULL,
  "type" "LoyaltyTransactionType" NOT NULL, "points" INTEGER NOT NULL, "balanceAfter" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerLoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosPromotion_tenantId_code_key" ON "PosPromotion"("tenantId", "code");
CREATE INDEX "PosPromotion_tenantId_isActive_startsAt_endsAt_idx" ON "PosPromotion"("tenantId", "isActive", "startsAt", "endsAt");
CREATE UNIQUE INDEX "PosCoupon_tenantId_code_key" ON "PosCoupon"("tenantId", "code");
CREATE INDEX "PosCoupon_tenantId_isActive_startsAt_endsAt_idx" ON "PosCoupon"("tenantId", "isActive", "startsAt", "endsAt");
CREATE UNIQUE INDEX "PosCouponRedemption_saleId_key" ON "PosCouponRedemption"("saleId");
CREATE INDEX "PosCouponRedemption_couponId_customerId_idx" ON "PosCouponRedemption"("couponId", "customerId");
CREATE INDEX "PosCouponRedemption_tenantId_createdAt_idx" ON "PosCouponRedemption"("tenantId", "createdAt");
CREATE UNIQUE INDEX "PosManagerApproval_saleId_key" ON "PosManagerApproval"("saleId");
CREATE INDEX "PosManagerApproval_tenantId_status_createdAt_idx" ON "PosManagerApproval"("tenantId", "status", "createdAt");
CREATE INDEX "PosManagerApproval_fingerprint_status_idx" ON "PosManagerApproval"("fingerprint", "status");
CREATE UNIQUE INDEX "CustomerLoyaltyTransaction_saleId_type_key" ON "CustomerLoyaltyTransaction"("saleId", "type");
CREATE INDEX "CustomerLoyaltyTransaction_customerId_createdAt_idx" ON "CustomerLoyaltyTransaction"("customerId", "createdAt");
CREATE INDEX "CustomerLoyaltyTransaction_tenantId_createdAt_idx" ON "CustomerLoyaltyTransaction"("tenantId", "createdAt");

ALTER TABLE "PosPromotion" ADD CONSTRAINT "PosPromotion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosCoupon" ADD CONSTRAINT "PosCoupon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosCouponRedemption" ADD CONSTRAINT "PosCouponRedemption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosCouponRedemption" ADD CONSTRAINT "PosCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PosCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosCouponRedemption" ADD CONSTRAINT "PosCouponRedemption_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosCouponRedemption" ADD CONSTRAINT "PosCouponRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosManagerApproval" ADD CONSTRAINT "PosManagerApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosManagerApproval" ADD CONSTRAINT "PosManagerApproval_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerLoyaltyTransaction" ADD CONSTRAINT "CustomerLoyaltyTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLoyaltyTransaction" ADD CONSTRAINT "CustomerLoyaltyTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLoyaltyTransaction" ADD CONSTRAINT "CustomerLoyaltyTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "PosPromotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
