ALTER TYPE "StorefrontPaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
ALTER TYPE "StorefrontPaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

CREATE TYPE "RestaurantCancellationDisposition" AS ENUM ('NOT_PREPARED', 'WASTE');

ALTER TABLE "StorefrontPayment"
  ADD COLUMN "refundedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "SalesOrderItem"
  ADD COLUMN "returnedQty" DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE "RestaurantOrderItem"
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "cancelDisposition" "RestaurantCancellationDisposition",
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT;

ALTER TABLE "RestaurantKitchenTicket"
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "SalesReturn"
  ADD COLUMN "refundMethod" TEXT,
  ADD COLUMN "refundReference" TEXT,
  ADD COLUMN "refundedAt" TIMESTAMP(3);

ALTER TABLE "SalesReturnItem"
  ADD COLUMN "salesOrderItemId" TEXT,
  ADD COLUMN "disposition" "PosReturnDisposition" NOT NULL DEFAULT 'SELLABLE';

CREATE INDEX "SalesReturnItem_salesOrderItemId_idx" ON "SalesReturnItem"("salesOrderItemId");
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_salesOrderItemId_fkey"
  FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;