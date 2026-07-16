CREATE TYPE "PosReturnDisposition" AS ENUM ('SELLABLE', 'DAMAGED', 'SCRAP');

ALTER TABLE "PosSale" ADD COLUMN "exchangeRefundId" TEXT;
ALTER TABLE "PosRefund" ADD COLUMN "writeOffCost" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PosRefundItem" ADD COLUMN "disposition" "PosReturnDisposition" NOT NULL DEFAULT 'SELLABLE';

CREATE UNIQUE INDEX "PosSale_exchangeRefundId_key" ON "PosSale"("exchangeRefundId");

ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_exchangeRefundId_fkey" FOREIGN KEY ("exchangeRefundId") REFERENCES "PosRefund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
