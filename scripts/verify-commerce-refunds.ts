import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { refundStorefrontSalesOrder } from "../src/lib/sales-refunds";
import { seedTenantDefaults } from "../src/lib/seed-tenant";
import { assertTestDatabase } from "./assert-test-database";

assertTestDatabase(/^erp_commerce_test_[a-z0-9_]+$/, "erp_commerce_test_*");

async function assertJournalBalanced(tenantId: string, returnNumber: string) {
  const journal = await prisma.journalEntry.findFirstOrThrow({
    where: { tenantId, summary: { contains: returnNumber } },
    include: { lines: true },
  });
  const debit = journal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = journal.lines.reduce((sum, line) => sum + Number(line.credit), 0);
  assert.equal(Math.round(debit * 100), Math.round(credit * 100));
}

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await prisma.tenant.create({ data: { name: `電商退款測試-${suffix}`, businessMode: "ERP" } });
  await seedTenantDefaults(tenant.id);
  const [warehouse, user] = await Promise.all([
    prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id, code: "WH01" } }),
    prisma.user.create({ data: { tenantId: tenant.id, username: `commerce-${suffix}`, email: `commerce-${suffix}@example.invalid`, name: "電商退款測試員", passwordHash: "not-a-real-password-hash" } }),
  ]);
  const [product, customer] = await Promise.all([
    prisma.product.create({ data: { tenantId: tenant.id, sku: `WEB-${suffix}`, name: "電商退款商品", costPrice: 40, salePrice: 105 } }),
    prisma.customer.create({ data: { tenantId: tenant.id, code: `WEB-C-${suffix}`, companyName: "電商退款客戶" } }),
  ]);
  await prisma.inventoryStock.create({ data: { tenantId: tenant.id, productId: product.id, warehouseId: warehouse.id, quantity: 8 } });
  const order = await prisma.salesOrder.create({
    data: {
      tenantId: tenant.id,
      number: `EC-${suffix}`,
      customerId: customer.id,
      warehouseId: warehouse.id,
      status: "POSTED",
      subtotal: 200,
      taxAmount: 10,
      total: 210,
      isTaxable: true,
      remark: "[WEB] refund integration fixture",
      items: { create: { productId: product.id, quantity: 2, shippedQty: 2, unitPrice: 100, taxRate: 0.05, subtotal: 200 } },
      storefrontPayment: { create: { tenantId: tenant.id, method: "CARD", status: "PAID", amount: 210, providerReference: `PAY-${suffix}`, paidAt: new Date() } },
    },
    include: { items: true, storefrontPayment: true },
  });

  const partial = await refundStorefrontSalesOrder({
    tenantId: tenant.id,
    userId: user.id,
    salesOrderId: order.id,
    reason: "客戶退回一件良品",
    refundReference: `RF-PART-${suffix}`,
    items: [{ orderItemId: order.items[0].id, quantity: 1, disposition: "SELLABLE" }],
  });
  assert.equal(partial.fullReturn, false);
  assert.equal(partial.totals.total, 105);
  assert.equal(partial.totals.cogs, 40);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({ where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } } })).quantity), 9);
  assert.equal(Number((await prisma.salesOrderItem.findUniqueOrThrow({ where: { id: order.items[0].id } })).returnedQty), 1);
  const partialPayment = await prisma.storefrontPayment.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(partialPayment.status, "PARTIALLY_REFUNDED");
  assert.equal(Number(partialPayment.refundedAmount), 105);
  await assertJournalBalanced(tenant.id, partial.salesReturn.number);

  const completed = await refundStorefrontSalesOrder({
    tenantId: tenant.id,
    userId: user.id,
    salesOrderId: order.id,
    reason: "剩餘商品已拆封報廢",
    refundReference: `RF-FULL-${suffix}`,
    items: [{ orderItemId: order.items[0].id, quantity: 1, disposition: "SCRAP" }],
  });
  assert.equal(completed.fullReturn, true);
  assert.equal(completed.fullyRefunded, true);
  assert.equal(completed.totals.cogs, 0);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({ where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } } })).quantity), 9);
  assert.equal(Number((await prisma.salesOrderItem.findUniqueOrThrow({ where: { id: order.items[0].id } })).returnedQty), 2);
  const completedPayment = await prisma.storefrontPayment.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(completedPayment.status, "REFUNDED");
  assert.equal(Number(completedPayment.refundedAmount), 210);
  assert.equal(await prisma.salesReturn.count({ where: { salesOrderId: order.id, status: "POSTED" } }), 2);
  const receivableCredit = await prisma.accountsReceivable.aggregate({ where: { salesOrderId: order.id }, _sum: { amount: true, paidAmount: true } });
  assert.equal(Number(receivableCredit._sum.amount), -210);
  assert.equal(Number(receivableCredit._sum.paidAmount), -210);
  await assertJournalBalanced(tenant.id, completed.salesReturn.number);

  process.stdout.write(`${JSON.stringify({ ok: true, partialRefund: 105, fullRefund: 210, sellableRestocked: true, scrapNotRestocked: true, paymentStatus: "REFUNDED", accountingBalanced: true }, null, 2)}\n`);
}

main().finally(async () => prisma.$disconnect());