-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('POSTED', 'VOIDED');

-- AlterEnum
ALTER TYPE "PurchaseStatus" ADD VALUE 'PARTIALLY_RECEIVED';

-- AlterEnum
ALTER TYPE "SalesStatus" ADD VALUE 'PARTIALLY_SHIPPED';

-- AlterTable
ALTER TABLE "AccountsPayable" ADD COLUMN     "purchaseReceiptId" TEXT;

-- AlterTable
ALTER TABLE "AccountsReceivable" ADD COLUMN     "salesShipmentId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'POSTED',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesShipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "shipmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'POSTED',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "SalesShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "SalesShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseReceipt_tenantId_receiptDate_idx" ON "PurchaseReceipt"("tenantId", "receiptDate");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_orderId_createdAt_idx" ON "PurchaseReceipt"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_warehouseId_createdAt_idx" ON "PurchaseReceipt"("warehouseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_tenantId_number_key" ON "PurchaseReceipt"("tenantId", "number");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_orderItemId_idx" ON "PurchaseReceiptItem"("orderItemId");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_productId_idx" ON "PurchaseReceiptItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptItem_receiptId_orderItemId_key" ON "PurchaseReceiptItem"("receiptId", "orderItemId");

-- CreateIndex
CREATE INDEX "SalesShipment_tenantId_shipmentDate_idx" ON "SalesShipment"("tenantId", "shipmentDate");

-- CreateIndex
CREATE INDEX "SalesShipment_orderId_createdAt_idx" ON "SalesShipment"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesShipment_warehouseId_createdAt_idx" ON "SalesShipment"("warehouseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesShipment_tenantId_number_key" ON "SalesShipment"("tenantId", "number");

-- CreateIndex
CREATE INDEX "SalesShipmentItem_orderItemId_idx" ON "SalesShipmentItem"("orderItemId");

-- CreateIndex
CREATE INDEX "SalesShipmentItem_productId_idx" ON "SalesShipmentItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesShipmentItem_shipmentId_orderItemId_key" ON "SalesShipmentItem"("shipmentId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountsPayable_purchaseReceiptId_key" ON "AccountsPayable"("purchaseReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountsReceivable_salesShipmentId_key" ON "AccountsReceivable"("salesShipmentId");

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipment" ADD CONSTRAINT "SalesShipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipment" ADD CONSTRAINT "SalesShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipment" ADD CONSTRAINT "SalesShipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipmentItem" ADD CONSTRAINT "SalesShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "SalesShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipmentItem" ADD CONSTRAINT "SalesShipmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipmentItem" ADD CONSTRAINT "SalesShipmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_salesShipmentId_fkey" FOREIGN KEY ("salesShipmentId") REFERENCES "SalesShipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
