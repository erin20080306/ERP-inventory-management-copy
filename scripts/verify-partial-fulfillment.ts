import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { receivePurchaseOrder, shipSalesOrder } from "../src/lib/documents";
import { seedTenantDefaults } from "../src/lib/seed-tenant";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("請設定 DATABASE_URL");
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, "");
const isNamedTestDatabase = /^erp_stage2_test_[a-z0-9_]+$/.test(databaseName);
const isGithubActionsEphemeralDatabase =
  process.env.GITHUB_ACTIONS === "true"
  && process.env.CI === "true"
  && databaseName === "erp"
  && ["127.0.0.1", "localhost"].includes(parsedDatabaseUrl.hostname)
  && decodeURIComponent(parsedDatabaseUrl.username) === "postgres";
if (!isNamedTestDatabase && !isGithubActionsEphemeralDatabase) {
  throw new Error(`只允許在 erp_stage2_test_* 測試資料庫，或 GitHub Actions 的本機暫存 erp 資料庫執行；目前為 ${parsedDatabaseUrl.hostname}/${databaseName}`);
}
process.stdout.write(`部分履約測試資料庫安全檢查：${isNamedTestDatabase ? "命名測試資料庫" : "GitHub Actions 暫存資料庫"}\n`);

async function createFixture(suffix: string) {
  const tenant = await prisma.tenant.create({ data: { name: `部分履約測試-${suffix}` } });
  await seedTenantDefaults(tenant.id);
  const [warehouse, supplier, customer, product] = await Promise.all([
    prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id, code: "WH01" } }),
    prisma.supplier.create({ data: { tenantId: tenant.id, code: `SUP-${suffix}`, companyName: `供應商-${suffix}` } }),
    prisma.customer.create({ data: { tenantId: tenant.id, code: `CUS-${suffix}`, companyName: `客戶-${suffix}` } }),
    prisma.product.create({
      data: {
        tenantId: tenant.id,
        sku: `SKU-${suffix}`,
        name: `測試商品-${suffix}`,
        costPrice: 50,
        salePrice: 200,
      },
    }),
  ]);
  return { tenant, warehouse, supplier, customer, product };
}

async function assertJournalBalanced(summaryContains: string, tenantId: string) {
  const journal = await prisma.journalEntry.findFirstOrThrow({
    where: { tenantId, summary: { contains: summaryContains } },
    include: { lines: true },
  });
  const debit = journal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = journal.lines.reduce((sum, line) => sum + Number(line.credit), 0);
  assert.equal(Math.round(debit * 100), Math.round(credit * 100));
  assert.equal(journal.status, "POSTED");
}

async function main() {
  const fixture = await createFixture("happy");
  const purchase = await prisma.purchaseOrder.create({
    data: {
      tenantId: fixture.tenant.id,
      number: "PO-STAGE2-0001",
      supplierId: fixture.supplier.id,
      status: "APPROVED",
      subtotal: 1000,
      discount: 0,
      taxAmount: 50,
      total: 1050,
      items: {
        create: {
          productId: fixture.product.id,
          quantity: 10,
          unitPrice: 100,
          discount: 0,
          taxRate: 0.05,
          subtotal: 1000,
        },
      },
    },
    include: { items: true },
  });

  const firstReceipt = await receivePurchaseOrder(
    purchase.id,
    fixture.warehouse.id,
    fixture.tenant.id,
    [{ orderItemId: purchase.items[0].id, quantity: 4 }],
  );
  assert.equal(firstReceipt.complete, false);
  assert.equal((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } })).status, "PARTIALLY_RECEIVED");
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: fixture.product.id, warehouseId: fixture.warehouse.id } },
  })).quantity), 4);
  assert.equal(Number((await prisma.accountsPayable.findUniqueOrThrow({
    where: { purchaseReceiptId: firstReceipt.receipt.id },
  })).amount), 420);
  await assertJournalBalanced(firstReceipt.receipt.number, fixture.tenant.id);

  const finalReceipt = await receivePurchaseOrder(
    purchase.id,
    fixture.warehouse.id,
    fixture.tenant.id,
    [{ orderItemId: purchase.items[0].id, quantity: 6 }],
  );
  assert.equal(finalReceipt.complete, true);
  const completedPurchase = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id }, include: { items: true } });
  assert.equal(completedPurchase.status, "POSTED");
  assert.equal(Number(completedPurchase.items[0].receivedQty), 10);
  const payables = await prisma.accountsPayable.aggregate({ where: { purchaseOrderId: purchase.id }, _sum: { amount: true } });
  assert.equal(Number(payables._sum.amount), 1050);
  await assertJournalBalanced(finalReceipt.receipt.number, fixture.tenant.id);

  const sale = await prisma.salesOrder.create({
    data: {
      tenantId: fixture.tenant.id,
      number: "SO-STAGE2-0001",
      customerId: fixture.customer.id,
      status: "APPROVED",
      subtotal: 1600,
      discount: 0,
      taxAmount: 80,
      total: 1680,
      items: {
        create: {
          productId: fixture.product.id,
          quantity: 8,
          unitPrice: 200,
          discount: 0,
          taxRate: 0.05,
          subtotal: 1600,
        },
      },
    },
    include: { items: true },
  });

  const firstShipment = await shipSalesOrder(
    sale.id,
    fixture.warehouse.id,
    fixture.tenant.id,
    [{ orderItemId: sale.items[0].id, quantity: 3 }],
  );
  assert.equal(firstShipment.complete, false);
  assert.equal(firstShipment.cogs, 150);
  assert.equal((await prisma.salesOrder.findUniqueOrThrow({ where: { id: sale.id } })).status, "PARTIALLY_SHIPPED");
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: fixture.product.id, warehouseId: fixture.warehouse.id } },
  })).quantity), 7);
  assert.equal(Number((await prisma.accountsReceivable.findUniqueOrThrow({
    where: { salesShipmentId: firstShipment.shipment.id },
  })).amount), 630);
  await assertJournalBalanced(firstShipment.shipment.number, fixture.tenant.id);

  const finalShipment = await shipSalesOrder(
    sale.id,
    fixture.warehouse.id,
    fixture.tenant.id,
    [{ orderItemId: sale.items[0].id, quantity: 5 }],
  );
  assert.equal(finalShipment.complete, true);
  const completedSale = await prisma.salesOrder.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
  assert.equal(completedSale.status, "POSTED");
  assert.equal(Number(completedSale.items[0].shippedQty), 8);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: fixture.product.id, warehouseId: fixture.warehouse.id } },
  })).quantity), 2);
  const receivables = await prisma.accountsReceivable.aggregate({ where: { salesOrderId: sale.id }, _sum: { amount: true } });
  assert.equal(Number(receivables._sum.amount), 1680);
  await assertJournalBalanced(finalShipment.shipment.number, fixture.tenant.id);

  const rollbackFixture = await createFixture("rollback");
  await prisma.chartOfAccount.delete({
    where: { tenantId_code: { tenantId: rollbackFixture.tenant.id, code: "2103" } },
  });
  const rollbackPurchase = await prisma.purchaseOrder.create({
    data: {
      tenantId: rollbackFixture.tenant.id,
      number: "PO-STAGE2-ROLLBACK",
      supplierId: rollbackFixture.supplier.id,
      status: "APPROVED",
      subtotal: 100,
      taxAmount: 5,
      total: 105,
      items: {
        create: {
          productId: rollbackFixture.product.id,
          quantity: 1,
          unitPrice: 100,
          taxRate: 0.05,
          subtotal: 100,
        },
      },
    },
    include: { items: true },
  });
  await assert.rejects(
    receivePurchaseOrder(
      rollbackPurchase.id,
      rollbackFixture.warehouse.id,
      rollbackFixture.tenant.id,
      [{ orderItemId: rollbackPurchase.items[0].id, quantity: 1 }],
    ),
    /缺少標準會計科目：2103/,
  );
  assert.equal(await prisma.purchaseReceipt.count({ where: { orderId: rollbackPurchase.id } }), 0);
  assert.equal(await prisma.accountsPayable.count({ where: { purchaseOrderId: rollbackPurchase.id } }), 0);
  // 租戶初始化現在會建立 ERP 範例商品與期初庫存；回滾驗證必須只檢查本次測試商品，
  // 不能再以整個租戶的庫存筆數為 0 作為條件。
  assert.equal(await prisma.inventoryStock.count({
    where: {
      tenantId: rollbackFixture.tenant.id,
      productId: rollbackFixture.product.id,
      warehouseId: rollbackFixture.warehouse.id,
    },
  }), 0);
  assert.equal(Number((await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: rollbackPurchase.items[0].id } })).receivedQty), 0);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    purchase: { receipts: 2, totalReceived: 10, payableTotal: 1050 },
    sales: { shipments: 2, totalShipped: 8, receivableTotal: 1680, endingStock: 2 },
    atomicRollback: true,
  }, null, 2)}\n`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
