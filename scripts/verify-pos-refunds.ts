import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { refundPosSale } from "../src/lib/pos-refunds";
import { seedTenantDefaults } from "../src/lib/seed-tenant";
import { assertTestDatabase } from "./assert-test-database";

assertTestDatabase(/^erp_pos_test_[a-z0-9_]+$/, "erp_pos_test_*");

async function createFixture(suffix: string) {
  const tenant = await prisma.tenant.create({ data: { name: `POS 退款測試-${suffix}`, businessMode: "POS" } });
  await seedTenantDefaults(tenant.id);
  const originalWarehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id, code: "WH01" } });
  const originalRegister = await prisma.posRegister.findFirstOrThrow({ where: { tenantId: tenant.id, code: "POS01" } });
  const currentWarehouse = await prisma.warehouse.create({ data: { tenantId: tenant.id, code: `WH02-${suffix}`, name: "退款操作門市" } });
  const currentRegister = await prisma.posRegister.create({ data: { tenantId: tenant.id, warehouseId: currentWarehouse.id, code: `POS02-${suffix}`, name: "退款操作收銀台" } });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: `pos-user-${suffix}`,
      email: `pos-user-${suffix}@example.invalid`,
      name: `POS 測試人員-${suffix}`,
      passwordHash: "not-a-real-password-hash",
    },
  });
  const shift = await prisma.posShift.create({ data: { tenantId: tenant.id, registerId: currentRegister.id, userId: user.id, openingCash: 1000 } });
  const product = await prisma.product.create({
    data: { tenantId: tenant.id, sku: `POS-SKU-${suffix}`, name: `POS 測試商品-${suffix}`, costPrice: 50, salePrice: 105 },
  });
  const customer = await prisma.customer.create({ data: { tenantId: tenant.id, code: `MEM-${suffix}`, companyName: `會員-${suffix}`, loyaltyPoints: 10 } });
  await prisma.inventoryStock.create({ data: { tenantId: tenant.id, productId: product.id, warehouseId: originalWarehouse.id, quantity: 5 } });
  const sale = await prisma.posSale.create({
    data: {
      tenantId: tenant.id,
      shiftId: shift.id,
      registerId: originalRegister.id,
      customerId: customer.id,
      number: `POS-ORIGINAL-${suffix}`,
      subtotal: 500,
      taxAmount: 25,
      total: 525,
      paidAmount: 525,
      items: {
        create: { productId: product.id, quantity: 5, unitPrice: 105, unitCost: 50, taxRate: 0.05, subtotal: 525 },
      },
      payments: {
        create: [
          { method: "CASH", amount: 300 },
          { method: "CARD", amount: 225 },
        ],
      },
    },
    include: { items: true },
  });
  return { tenant, originalWarehouse, currentWarehouse, userId: user.id, shift, product, sale, customer };
}

async function assertJournalBalanced(tenantId: string, refundNumber: string) {
  const journal = await prisma.journalEntry.findFirstOrThrow({
    where: { tenantId, summary: { contains: refundNumber } },
    include: { lines: true },
  });
  const debit = journal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = journal.lines.reduce((sum, line) => sum + Number(line.credit), 0);
  assert.equal(Math.round(debit * 100), Math.round(credit * 100));
}

async function main() {
  const fixture = await createFixture("happy");
  const first = await refundPosSale({
    tenantId: fixture.tenant.id,
    userId: fixture.userId,
    shiftId: fixture.shift.id,
    saleId: fixture.sale.id,
    reason: "部分商品退貨",
    items: [{ saleItemId: fixture.sale.items[0].id, quantity: 2 }],
  });
  assert.equal(first.fullyRefunded, false);
  assert.equal(first.totals.total, 210);
  assert.equal(first.totals.cogs, 100);
  assert.equal((await prisma.posSale.findUniqueOrThrow({ where: { id: fixture.sale.id } })).status, "PARTIALLY_REFUNDED");
  assert.equal(Number((await prisma.posSaleItem.findUniqueOrThrow({ where: { id: fixture.sale.items[0].id } })).returnedQty), 2);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: fixture.product.id, warehouseId: fixture.originalWarehouse.id } },
  })).quantity), 7);
  assert.equal(await prisma.inventoryStock.count({ where: { productId: fixture.product.id, warehouseId: fixture.currentWarehouse.id } }), 0);
  const firstPayments = new Map(first.refund.payments.map((payment: any) => [payment.method, Number(payment.amount)]));
  assert.equal(firstPayments.get("CASH"), 120);
  assert.equal(firstPayments.get("CARD"), 90);
  await assertJournalBalanced(fixture.tenant.id, first.refund.number);

  const second = await refundPosSale({
    tenantId: fixture.tenant.id,
    userId: fixture.userId,
    shiftId: fixture.shift.id,
    saleId: fixture.sale.id,
    reason: "剩餘商品全退",
    items: [{ saleItemId: fixture.sale.items[0].id, quantity: 3 }],
  });
  assert.equal(second.fullyRefunded, true);
  assert.equal(second.totals.total, 315);
  assert.equal((await prisma.posSale.findUniqueOrThrow({ where: { id: fixture.sale.id } })).status, "REFUNDED");
  const secondPayments = new Map(second.refund.payments.map((payment: any) => [payment.method, Number(payment.amount)]));
  assert.equal(secondPayments.get("CASH"), 180);
  assert.equal(secondPayments.get("CARD"), 135);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: fixture.product.id, warehouseId: fixture.originalWarehouse.id } },
  })).quantity), 10);
  await assertJournalBalanced(fixture.tenant.id, second.refund.number);

  const disposition = await createFixture("disposition");
  await prisma.posSale.update({ where: { id: disposition.sale.id }, data: { loyaltyPointsEarned: 5 } });
  const crossStore = await refundPosSale({
    tenantId: disposition.tenant.id,
    userId: disposition.userId,
    shiftId: disposition.shift.id,
    saleId: disposition.sale.id,
    returnWarehouseId: disposition.currentWarehouse.id,
    reason: "跨店退回一件良品與一件瑕疵",
    items: [
      { saleItemId: disposition.sale.items[0].id, quantity: 1, disposition: "SELLABLE" },
      { saleItemId: disposition.sale.items[0].id, quantity: 1, disposition: "DAMAGED" },
    ],
  }).catch(async (error) => {
    // 同一 saleItem 不可重複；以單一瑕疵測試驗證不回庫，良品跨店另用第二筆。
    assert.match(String(error?.message), /不可重複/);
    const damaged = await refundPosSale({
      tenantId: disposition.tenant.id,
      userId: disposition.userId,
      shiftId: disposition.shift.id,
      saleId: disposition.sale.id,
      returnWarehouseId: disposition.currentWarehouse.id,
      reason: "瑕疵品不回可售庫存",
      items: [{ saleItemId: disposition.sale.items[0].id, quantity: 1, disposition: "DAMAGED" }],
    });
    return damaged;
  });
  assert.equal(crossStore.totals.writeOffCost, 50);
  assert.equal(crossStore.totals.cogs, 0);
  assert.equal(await prisma.inventoryStock.count({ where: { productId: disposition.product.id, warehouseId: disposition.currentWarehouse.id } }), 0);
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: disposition.customer.id } })).loyaltyPoints, 9);
  const sellableCrossStore = await refundPosSale({
    tenantId: disposition.tenant.id,
    userId: disposition.userId,
    shiftId: disposition.shift.id,
    saleId: disposition.sale.id,
    returnWarehouseId: disposition.currentWarehouse.id,
    reason: "良品跨店退貨",
    items: [{ saleItemId: disposition.sale.items[0].id, quantity: 1, disposition: "SELLABLE" }],
  });
  assert.equal(sellableCrossStore.totals.cogs, 50);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({ where: { productId_warehouseId: { productId: disposition.product.id, warehouseId: disposition.currentWarehouse.id } } })).quantity), 1);
  await assertJournalBalanced(disposition.tenant.id, sellableCrossStore.refund.number);

  const rollback = await createFixture("rollback");
  await prisma.chartOfAccount.delete({ where: { tenantId_code: { tenantId: rollback.tenant.id, code: "4102" } } });
  await assert.rejects(
    refundPosSale({
      tenantId: rollback.tenant.id,
      userId: rollback.userId,
      shiftId: rollback.shift.id,
      saleId: rollback.sale.id,
      reason: "測試帳務失敗回復",
      items: [{ saleItemId: rollback.sale.items[0].id, quantity: 1 }],
    }),
    /缺少標準會計科目：4102/,
  );
  assert.equal(await prisma.posRefund.count({ where: { saleId: rollback.sale.id } }), 0);
  assert.equal(Number((await prisma.posSaleItem.findUniqueOrThrow({ where: { id: rollback.sale.items[0].id } })).returnedQty), 0);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: rollback.product.id, warehouseId: rollback.originalWarehouse.id } },
  })).quantity), 5);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    partialRefund: 210,
    finalRefund: 315,
    paymentAllocation: { CASH: 300, CARD: 225 },
    returnedToOriginalWarehouse: true,
    damagedNotRestocked: true,
    crossStoreRestocked: true,
    loyaltyReversedOnRefund: true,
    atomicRollback: true,
  }, null, 2)}\n`);
}

main().finally(async () => prisma.$disconnect());
