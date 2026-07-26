import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { assertTestDatabase } from "./assert-test-database";

assertTestDatabase(/^erp_tenant_constraints_test_[a-z0-9_]+$/, "erp_tenant_constraints_test_*");

const suffix = randomBytes(6).toString("hex");
let tenantA = "";
let tenantB = "";

async function expectTenantConstraint(operation: Promise<unknown>) {
  await assert.rejects(operation, (error: any) => {
    return error?.code === "P2003" || /foreign key constraint/i.test(String(error?.message || error));
  });
}

async function cleanup() {
  if (tenantA) {
    await prisma.storefrontPayment.deleteMany({ where: { tenantId: tenantA } });
    await prisma.inventoryTransaction.deleteMany({ where: { tenantId: tenantA } });
    await prisma.inventoryStock.deleteMany({ where: { tenantId: tenantA } });
    await prisma.purchaseOrder.deleteMany({ where: { tenantId: tenantA } });
    await prisma.salesOrder.deleteMany({ where: { tenantId: tenantA } });
    await prisma.product.deleteMany({ where: { tenantId: tenantA } });
    await prisma.warehouse.deleteMany({ where: { tenantId: tenantA } });
    await prisma.customer.deleteMany({ where: { tenantId: tenantA } });
    await prisma.supplier.deleteMany({ where: { tenantId: tenantA } });
    await prisma.tenant.deleteMany({ where: { id: tenantA } });
  }
  if (tenantB) {
    await prisma.storefrontPayment.deleteMany({ where: { tenantId: tenantB } });
    await prisma.inventoryTransaction.deleteMany({ where: { tenantId: tenantB } });
    await prisma.inventoryStock.deleteMany({ where: { tenantId: tenantB } });
    await prisma.purchaseOrder.deleteMany({ where: { tenantId: tenantB } });
    await prisma.salesOrder.deleteMany({ where: { tenantId: tenantB } });
    await prisma.product.deleteMany({ where: { tenantId: tenantB } });
    await prisma.warehouse.deleteMany({ where: { tenantId: tenantB } });
    await prisma.customer.deleteMany({ where: { tenantId: tenantB } });
    await prisma.supplier.deleteMany({ where: { tenantId: tenantB } });
    await prisma.tenant.deleteMany({ where: { id: tenantB } });
  }
}

async function main() {
  try {
    const [a, b] = await Promise.all([
      prisma.tenant.create({ data: { name: `租戶約束 A-${suffix}` } }),
      prisma.tenant.create({ data: { name: `租戶約束 B-${suffix}` } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    const [productA, productB, warehouseA, warehouseB, customerA, customerB, supplierA, supplierB] = await Promise.all([
      prisma.product.create({ data: { tenantId: tenantA, sku: `PA-${suffix}`, name: "A 商品" } }),
      prisma.product.create({ data: { tenantId: tenantB, sku: `PB-${suffix}`, name: "B 商品" } }),
      prisma.warehouse.create({ data: { tenantId: tenantA, code: `WA-${suffix}`, name: "A 倉" } }),
      prisma.warehouse.create({ data: { tenantId: tenantB, code: `WB-${suffix}`, name: "B 倉" } }),
      prisma.customer.create({ data: { tenantId: tenantA, code: `CA-${suffix}`, companyName: "A 客戶" } }),
      prisma.customer.create({ data: { tenantId: tenantB, code: `CB-${suffix}`, companyName: "B 客戶" } }),
      prisma.supplier.create({ data: { tenantId: tenantA, code: `SA-${suffix}`, companyName: "A 供應商" } }),
      prisma.supplier.create({ data: { tenantId: tenantB, code: `SB-${suffix}`, companyName: "B 供應商" } }),
    ]);

    await prisma.inventoryStock.create({
      data: { tenantId: tenantA, productId: productA.id, warehouseId: warehouseA.id, quantity: 10 },
    });

    await expectTenantConstraint(prisma.inventoryStock.create({
      data: { tenantId: tenantA, productId: productB.id, warehouseId: warehouseA.id, quantity: 1 },
    }));
    await expectTenantConstraint(prisma.inventoryTransaction.create({
      data: { tenantId: tenantA, productId: productA.id, warehouseId: warehouseB.id, type: "MANUAL", quantity: 1 },
    }));
    await expectTenantConstraint(prisma.purchaseOrder.create({
      data: { tenantId: tenantA, number: `PO-X-${suffix}`, supplierId: supplierB.id, warehouseId: warehouseA.id },
    }));
    await expectTenantConstraint(prisma.salesOrder.create({
      data: { tenantId: tenantA, number: `SO-X-${suffix}`, customerId: customerB.id, warehouseId: warehouseA.id },
    }));

    const orderB = await prisma.salesOrder.create({
      data: { tenantId: tenantB, number: `SO-B-${suffix}`, customerId: customerB.id, warehouseId: warehouseB.id },
    });
    await expectTenantConstraint(prisma.storefrontPayment.create({
      data: {
        tenantId: tenantA,
        orderId: orderB.id,
        method: "TRANSFER",
        status: "AWAITING_TRANSFER",
        amount: 100,
      },
    }));

    const expected = [
      "InventoryStock_product_tenant_fkey",
      "InventoryStock_warehouse_tenant_fkey",
      "InventoryTransaction_product_tenant_fkey",
      "InventoryTransaction_warehouse_tenant_fkey",
      "PurchaseOrder_supplier_tenant_fkey",
      "PurchaseOrder_warehouse_tenant_fkey",
      "SalesOrder_customer_tenant_fkey",
      "SalesOrder_warehouse_tenant_fkey",
      "StorefrontPayment_order_tenant_fkey",
    ];
    const constraints = await prisma.$queryRaw<Array<{ conname: string; convalidated: boolean }>>`
      SELECT conname, convalidated
      FROM pg_constraint
      WHERE conname = ANY(${expected}::text[])
    `;
    assert.equal(constraints.length, expected.length);
    assert.ok(constraints.every((row) => row.convalidated));

    // 保留變數使用，避免測試資料建立被未使用檢查誤判。
    assert.ok(customerA.id && supplierA.id);
    console.log("Phase-one tenant composite foreign keys block cross-tenant writes: PASS");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
