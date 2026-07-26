-- Phase 1 tenant-scope constraints.
-- These constraints cover the highest-risk master/header relationships first.
-- Existing single-column foreign keys remain in place for application compatibility.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "InventoryStock" child
    JOIN "Product" parent ON parent."id" = child."productId"
    WHERE parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'InventoryStock contains cross-tenant Product references'; END IF;

  IF EXISTS (
    SELECT 1 FROM "InventoryStock" child
    JOIN "Warehouse" parent ON parent."id" = child."warehouseId"
    WHERE parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'InventoryStock contains cross-tenant Warehouse references'; END IF;

  IF EXISTS (
    SELECT 1 FROM "InventoryTransaction" child
    JOIN "Product" parent ON parent."id" = child."productId"
    WHERE parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'InventoryTransaction contains cross-tenant Product references'; END IF;

  IF EXISTS (
    SELECT 1 FROM "InventoryTransaction" child
    JOIN "Warehouse" parent ON parent."id" = child."warehouseId"
    WHERE parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'InventoryTransaction contains cross-tenant Warehouse references'; END IF;

  IF EXISTS (
    SELECT 1 FROM "PurchaseOrder" child
    JOIN "Supplier" parent ON parent."id" = child."supplierId"
    WHERE parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'PurchaseOrder contains cross-tenant Supplier references'; END IF;

  IF EXISTS (
    SELECT 1 FROM "PurchaseOrder" child
    JOIN "Warehouse" parent ON parent."id" = child."warehouseId"
    WHERE child."warehouseId" IS NOT NULL AND parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'PurchaseOrder contains cross-tenant Warehouse references'; END IF;

  IF EXISTS (
    SELECT 1 FROM "SalesOrder" child
    JOIN "Customer" parent ON parent."id" = child."customerId"
    WHERE parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'SalesOrder contains cross-tenant Customer references'; END IF;

  IF EXISTS (
    SELECT 1 FROM "SalesOrder" child
    JOIN "Warehouse" parent ON parent."id" = child."warehouseId"
    WHERE child."warehouseId" IS NOT NULL AND parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'SalesOrder contains cross-tenant Warehouse references'; END IF;

  IF EXISTS (
    SELECT 1 FROM "StorefrontPayment" child
    JOIN "SalesOrder" parent ON parent."id" = child."orderId"
    WHERE parent."tenantId" <> child."tenantId"
  ) THEN RAISE EXCEPTION 'StorefrontPayment contains cross-tenant SalesOrder references'; END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_id_tenantId_key" ON "Product"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_id_tenantId_key" ON "Warehouse"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_id_tenantId_key" ON "Supplier"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_id_tenantId_key" ON "Customer"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_id_tenantId_key" ON "SalesOrder"("id", "tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryStock_product_tenant_fkey') THEN
    ALTER TABLE "InventoryStock"
      ADD CONSTRAINT "InventoryStock_product_tenant_fkey"
      FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId")
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryStock_warehouse_tenant_fkey') THEN
    ALTER TABLE "InventoryStock"
      ADD CONSTRAINT "InventoryStock_warehouse_tenant_fkey"
      FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryTransaction_product_tenant_fkey') THEN
    ALTER TABLE "InventoryTransaction"
      ADD CONSTRAINT "InventoryTransaction_product_tenant_fkey"
      FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId")
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryTransaction_warehouse_tenant_fkey') THEN
    ALTER TABLE "InventoryTransaction"
      ADD CONSTRAINT "InventoryTransaction_warehouse_tenant_fkey"
      FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_supplier_tenant_fkey') THEN
    ALTER TABLE "PurchaseOrder"
      ADD CONSTRAINT "PurchaseOrder_supplier_tenant_fkey"
      FOREIGN KEY ("supplierId", "tenantId") REFERENCES "Supplier"("id", "tenantId")
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_warehouse_tenant_fkey') THEN
    ALTER TABLE "PurchaseOrder"
      ADD CONSTRAINT "PurchaseOrder_warehouse_tenant_fkey"
      FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesOrder_customer_tenant_fkey') THEN
    ALTER TABLE "SalesOrder"
      ADD CONSTRAINT "SalesOrder_customer_tenant_fkey"
      FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId")
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesOrder_warehouse_tenant_fkey') THEN
    ALTER TABLE "SalesOrder"
      ADD CONSTRAINT "SalesOrder_warehouse_tenant_fkey"
      FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StorefrontPayment_order_tenant_fkey') THEN
    ALTER TABLE "StorefrontPayment"
      ADD CONSTRAINT "StorefrontPayment_order_tenant_fkey"
      FOREIGN KEY ("orderId", "tenantId") REFERENCES "SalesOrder"("id", "tenantId")
      ON DELETE CASCADE NOT VALID;
  END IF;
END
$$;

ALTER TABLE "InventoryStock" VALIDATE CONSTRAINT "InventoryStock_product_tenant_fkey";
ALTER TABLE "InventoryStock" VALIDATE CONSTRAINT "InventoryStock_warehouse_tenant_fkey";
ALTER TABLE "InventoryTransaction" VALIDATE CONSTRAINT "InventoryTransaction_product_tenant_fkey";
ALTER TABLE "InventoryTransaction" VALIDATE CONSTRAINT "InventoryTransaction_warehouse_tenant_fkey";
ALTER TABLE "PurchaseOrder" VALIDATE CONSTRAINT "PurchaseOrder_supplier_tenant_fkey";
ALTER TABLE "PurchaseOrder" VALIDATE CONSTRAINT "PurchaseOrder_warehouse_tenant_fkey";
ALTER TABLE "SalesOrder" VALIDATE CONSTRAINT "SalesOrder_customer_tenant_fkey";
ALTER TABLE "SalesOrder" VALIDATE CONSTRAINT "SalesOrder_warehouse_tenant_fkey";
ALTER TABLE "StorefrontPayment" VALIDATE CONSTRAINT "StorefrontPayment_order_tenant_fkey";
