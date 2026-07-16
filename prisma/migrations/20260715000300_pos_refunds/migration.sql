-- CreateEnum
CREATE TYPE "PosRefundStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterEnum
ALTER TYPE "PosSaleStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "PosSaleItem" ADD COLUMN "returnedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- Existing POS rows did not preserve historical unit cost. Use the current product cost as the safest available baseline.
UPDATE "PosSaleItem" AS item
SET "unitCost" = product."costPrice"
FROM "Product" AS product
WHERE item."productId" = product."id";

-- CreateTable
CREATE TABLE "PosRefund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "PosRefundStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "PosRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosRefundItem" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PosRefundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosRefundPayment" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosRefundPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosRefund_tenantId_createdAt_idx" ON "PosRefund"("tenantId", "createdAt");
CREATE INDEX "PosRefund_saleId_createdAt_idx" ON "PosRefund"("saleId", "createdAt");
CREATE INDEX "PosRefund_shiftId_createdAt_idx" ON "PosRefund"("shiftId", "createdAt");
CREATE INDEX "PosRefund_registerId_createdAt_idx" ON "PosRefund"("registerId", "createdAt");
CREATE INDEX "PosRefund_warehouseId_createdAt_idx" ON "PosRefund"("warehouseId", "createdAt");
CREATE UNIQUE INDEX "PosRefund_tenantId_number_key" ON "PosRefund"("tenantId", "number");
CREATE INDEX "PosRefundItem_saleItemId_idx" ON "PosRefundItem"("saleItemId");
CREATE INDEX "PosRefundItem_productId_idx" ON "PosRefundItem"("productId");
CREATE UNIQUE INDEX "PosRefundItem_refundId_saleItemId_key" ON "PosRefundItem"("refundId", "saleItemId");
CREATE INDEX "PosRefundPayment_refundId_idx" ON "PosRefundPayment"("refundId");
CREATE INDEX "PosRefundPayment_method_createdAt_idx" ON "PosRefundPayment"("method", "createdAt");

-- AddForeignKey
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosRefundItem" ADD CONSTRAINT "PosRefundItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "PosRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosRefundItem" ADD CONSTRAINT "PosRefundItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "PosSaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosRefundItem" ADD CONSTRAINT "PosRefundItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosRefundPayment" ADD CONSTRAINT "PosRefundPayment_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "PosRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
