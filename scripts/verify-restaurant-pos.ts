import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { seedTenantDefaults } from "../src/lib/seed-tenant";
import { createRestaurantTable, deleteRestaurantTableSafely, setRestaurantTableActive, updateRestaurantTable } from "../src/lib/restaurant-tables";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function main() {
  const tenant = await prisma.tenant.create({ data: { name: `餐飲流程測試-${suffix}`, businessMode: "POS_RESTAURANT" } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, username: `food-${suffix}`, email: `food-${suffix}@test.local`, name: "餐飲測試員", passwordHash: await bcrypt.hash("Test1234!", 4) } });
  try {
    await seedTenantDefaults(tenant.id);
    const [register, area, tables, warehouse] = await Promise.all([
      prisma.posRegister.findFirstOrThrow({ where: { tenantId: tenant.id } }),
      prisma.restaurantArea.findFirstOrThrow({ where: { tenantId: tenant.id } }),
      prisma.restaurantTable.findMany({ where: { tenantId: tenant.id } }),
      prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id } }),
    ]);
    assert.equal(area.code, "DINING");
    assert.equal(tables.length, 8);
    const createdTable = await createRestaurantTable(tenant.id, { areaId: area.id, code: "t09", name: "九號桌", seats: 6, sortOrder: 9 });
    assert.equal(createdTable.code, "T09");
    const updatedTable = await updateRestaurantTable(tenant.id, createdTable.id, { areaId: area.id, code: "T09", name: "包廂九號桌", seats: 8, sortOrder: 2 });
    assert.equal(updatedTable.name, "包廂九號桌");
    assert.equal(updatedTable.seats, 8);
    assert.equal((await setRestaurantTableActive(tenant.id, createdTable.id, false)).isActive, false);
    assert.equal((await setRestaurantTableActive(tenant.id, createdTable.id, true)).isActive, true);
    const unusedTable = await createRestaurantTable(tenant.id, { areaId: area.id, code: "TMP01", name: "臨時桌", seats: 2, sortOrder: 99 });
    assert.equal((await deleteRestaurantTableSafely(tenant.id, unusedTable.id)).mode, "DELETED");
    const category = await prisma.productCategory.create({ data: { tenantId: tenant.id, code: "MEAL", name: "主餐" } });
    const unit = await prisma.productUnit.create({ data: { tenantId: tenant.id, code: "PLATE", name: "份" } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, sku: "FOOD01", name: "測試餐點", categoryId: category.id, unitId: unit.id, salePrice: 200, costPrice: 80, imageUrl: "/demo-products/burger.svg" } });
    await prisma.inventoryStock.create({ data: { tenantId: tenant.id, productId: product.id, warehouseId: warehouse.id, quantity: 10 } });
    const shift = await prisma.posShift.create({ data: { tenantId: tenant.id, registerId: register.id, userId: user.id, openingCash: 1000 } });
    const order = await prisma.restaurantOrder.create({ data: { tenantId: tenant.id, tableId: tables[0].id, shiftId: shift.id, registerId: register.id, number: `DINE-${suffix}`, guests: 2, createdById: user.id } });
    await assert.rejects(() => setRestaurantTableActive(tenant.id, tables[0].id, false), /進行中的桌單/);
    await assert.rejects(() => deleteRestaurantTableSafely(tenant.id, tables[0].id), /進行中的桌單/);
    await prisma.restaurantOrder.create({ data: { tenantId: tenant.id, tableId: createdTable.id, shiftId: shift.id, registerId: register.id, number: `HIST-${suffix}`, status: "COMPLETED", guests: 1, createdById: user.id, completedAt: new Date() } });
    const archived = await deleteRestaurantTableSafely(tenant.id, createdTable.id);
    assert.equal(archived.mode, "ARCHIVED");
    assert.equal((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: createdTable.id } })).isActive, false);
    const item = await prisma.restaurantOrderItem.create({ data: { orderId: order.id, productId: product.id, quantity: 2, unitPrice: 200 } });
    const ticket = await prisma.restaurantKitchenTicket.create({ data: { tenantId: tenant.id, orderId: order.id, number: `KOT-${suffix}`, items: { create: [{ orderItemId: item.id }] } }, include: { items: true } });
    assert.equal(ticket.items.length, 1);
    await prisma.restaurantOrderItem.update({ where: { id: item.id }, data: { status: "SENT" } });
    await prisma.restaurantOrderItem.update({ where: { id: item.id }, data: { status: "PREPARING" } });
    const ready = await prisma.restaurantOrderItem.update({ where: { id: item.id }, data: { status: "READY" } });
    assert.equal(ready.status, "READY");
    console.log("Restaurant POS table CRUD, safe history archive, image menu, order and kitchen ticket: PASS");
  } finally {
    await prisma.$transaction(async (tx) => {
      await tx.restaurantOrder.deleteMany({ where: { tenantId: tenant.id } });
      await tx.posShift.deleteMany({ where: { tenantId: tenant.id } });
      await tx.restaurantTable.deleteMany({ where: { tenantId: tenant.id } });
      await tx.restaurantArea.deleteMany({ where: { tenantId: tenant.id } });
      await tx.posRegister.deleteMany({ where: { tenantId: tenant.id } });
      await tx.inventoryStock.deleteMany({ where: { tenantId: tenant.id } });
      await tx.inventoryTransaction.deleteMany({ where: { tenantId: tenant.id } });
      await tx.product.deleteMany({ where: { tenantId: tenant.id } });
      await tx.productCategory.deleteMany({ where: { tenantId: tenant.id } });
      await tx.productUnit.deleteMany({ where: { tenantId: tenant.id } });
      await tx.warehouse.deleteMany({ where: { tenantId: tenant.id } });
      await tx.chartOfAccount.deleteMany({ where: { tenantId: tenant.id } });
      await tx.taxRate.deleteMany({ where: { tenantId: tenant.id } });
      await tx.numberSequence.deleteMany({ where: { tenantId: tenant.id } });
      await tx.companySetting.deleteMany({ where: { tenantId: tenant.id } });
      await tx.user.delete({ where: { id: user.id } });
      await tx.tenant.delete({ where: { id: tenant.id } });
    });
  }
}

main().finally(() => prisma.$disconnect());
