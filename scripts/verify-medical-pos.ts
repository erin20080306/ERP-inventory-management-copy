import { strict as assert } from "node:assert";
import { fulfillPosSale } from "../src/lib/pos-fulfillment";
import { ensureMedicalAestheticsBaseline } from "../src/lib/medical-aesthetics";
import { prisma } from "../src/lib/prisma";
import { seedTenantDefaultsBatched } from "../src/lib/seed-tenant-batched";

async function createSale(input: {
  tenantId: string;
  shiftId: string;
  registerId: string;
  customerId: string;
  product: { id: string; salePrice: unknown; costPrice: unknown };
  number: string;
}) {
  const total = Number(input.product.salePrice);
  return prisma.posSale.create({
    data: {
      tenantId: input.tenantId,
      shiftId: input.shiftId,
      registerId: input.registerId,
      customerId: input.customerId,
      number: input.number,
      receiptNo: input.number,
      subtotal: total,
      taxAmount: 0,
      total,
      paidAmount: total,
      items: {
        create: {
          productId: input.product.id,
          quantity: 1,
          unitPrice: total,
          unitCost: Number(input.product.costPrice),
          discount: 0,
          taxRate: 0,
          subtotal: total,
        },
      },
      payments: { create: { method: "CASH", amount: total } },
    },
  });
}

async function main() {
  const suffix = Date.now().toString(36);
  const tenant = await prisma.tenant.create({ data: { name: `醫美驗證 ${suffix}`, businessMode: "POS_MEDICAL" } });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: `medical-test-${suffix}`,
      email: `medical-${suffix}@example.test`,
      name: "醫美驗證人員",
      passwordHash: "test-only",
    },
  });
  await seedTenantDefaultsBatched(tenant.id);
  await ensureMedicalAestheticsBaseline(tenant.id);
  await ensureMedicalAestheticsBaseline(tenant.id);

  const [serviceCount, packageCount, consumableCount, register, customer] = await Promise.all([
    prisma.medicalService.count({ where: { tenantId: tenant.id } }),
    prisma.medicalTreatmentPackage.count({ where: { tenantId: tenant.id } }),
    prisma.product.count({ where: { tenantId: tenant.id, catalogMode: "POS_MEDICAL", trackInventory: true } }),
    prisma.posRegister.findFirstOrThrow({ where: { tenantId: tenant.id, code: "MED-01" } }),
    prisma.customer.findFirstOrThrow({ where: { tenantId: tenant.id, code: "C001" } }),
  ]);
  assert.equal(serviceCount, 4, "應建立四項醫美服務，重跑不得重複");
  assert.equal(packageCount, 2, "應建立兩項療程套票");
  assert.equal(consumableCount, 3, "應建立三項追蹤庫存耗材");

  const shift = await prisma.posShift.create({ data: { tenantId: tenant.id, registerId: register.id, userId: user.id, openingCash: 3000 } });
  const service = await prisma.medicalService.findFirstOrThrow({
    where: { tenantId: tenant.id, code: "MED-HYDRATION" },
    include: { product: true, consumables: true },
  });
  assert.equal(service.product.trackInventory, false, "醫美服務不可直接扣商品庫存");
  assert.ok(service.consumables.length >= 1, "醫美服務應設定耗材配方");

  const serviceSale = await createSale({
    tenantId: tenant.id,
    shiftId: shift.id,
    registerId: register.id,
    customerId: customer.id,
    product: service.product,
    number: `TEST-SVC-${suffix}`,
  });
  await fulfillPosSale(serviceSale.id);
  const serviceInventoryRows = await prisma.inventoryTransaction.count({ where: { tenantId: tenant.id, refType: "POS", refId: serviceSale.id } });
  assert.equal(serviceInventoryRows, 0, "服務收款背景同步不得建立商品出庫");
  const serviceOrder = await prisma.salesOrder.findFirstOrThrow({ where: { posSale: { id: serviceSale.id } } });
  assert.equal(serviceOrder.isTaxable, false, "示範自費醫療服務應依設定為免稅");

  const packageDefinition = await prisma.medicalTreatmentPackage.findFirstOrThrow({
    where: { tenantId: tenant.id },
    include: { product: true },
  });
  const packageSale = await createSale({
    tenantId: tenant.id,
    shiftId: shift.id,
    registerId: register.id,
    customerId: customer.id,
    product: packageDefinition.product,
    number: `TEST-PKG-${suffix}`,
  });
  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);
  await prisma.medicalPackagePurchase.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      packageId: packageDefinition.id,
      posSaleId: packageSale.id,
      number: `TEST-MP-${suffix}`,
      totalSessions: packageDefinition.sessions,
      remainingSessions: packageDefinition.sessions,
      paidAmount: packageDefinition.product.salePrice,
      validUntil,
    },
  });
  await fulfillPosSale(packageSale.id);
  const packageInventoryRows = await prisma.inventoryTransaction.count({ where: { tenantId: tenant.id, refType: "POS", refId: packageSale.id } });
  assert.equal(packageInventoryRows, 0, "套票銷售不得直接扣耗材庫存");
  const deferredLine = await prisma.journalEntryLine.findFirst({
    where: {
      entry: { tenantId: tenant.id, summary: { contains: packageSale.number } },
      account: { code: "2121" },
      credit: { gt: 0 },
    },
  });
  assert.ok(deferredLine, "套票收款應貸記 2121 預收款項");
  assert.equal(Number(deferredLine?.credit), Number(packageDefinition.product.salePrice), "套票預收款金額應等於收款");

  console.log(`medical POS verification passed: tenant=${tenant.id}, services=${serviceCount}, packages=${packageCount}, consumables=${consumableCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
