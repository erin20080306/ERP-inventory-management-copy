import { prisma } from "./prisma";
import { STANDARD_ACCOUNTS } from "../../prisma/standard-accounts";
import { seedOperationalBaseline } from "./seed-operational-baseline";

/**
 * 由登入後的獨立初始化 API 建立公司基礎資料。
 * 大量固定資料使用 createMany，商品、庫存與桌位皆在單一交易內批次建立。
 */
export async function seedTenantDefaultsBatched(tenantId: string) {
  await prisma.$transaction(async (tx: any) => {
    const sequences = ["PO", "SO", "QT", "JE", "RP", "SP", "SR", "PR", "ADJ", "TRF", "INV", "DN", "GR", "POS", "PRF", "DINE", "KOT"];

    await tx.numberSequence.createMany({
      data: sequences.map((key) => ({ tenantId, key, prefix: key })),
      skipDuplicates: true,
    });

    await tx.taxRate.createMany({
      data: [
        { tenantId, code: "VAT5", name: "營業稅 5%", rate: 0.05, region: "TW" },
        { tenantId, code: "ZERO", name: "零稅率", rate: 0, region: "TW" },
      ],
      skipDuplicates: true,
    });

    await tx.warehouse.createMany({
      data: [{ tenantId, code: "WH01", name: "主倉庫" }],
      skipDuplicates: true,
    });

    await tx.chartOfAccount.createMany({
      data: STANDARD_ACCOUNTS.map((account) => ({
        tenantId,
        code: account.code,
        name: account.name,
        type: account.type,
      })),
      skipDuplicates: true,
    });

    const [tenant, mainWarehouse, companySetting] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, businessMode: true, isInternal: true },
      }),
      tx.warehouse.findFirst({
        where: { tenantId, code: "WH01" },
        select: { id: true },
      }),
      tx.companySetting.findFirst({
        where: { tenantId },
        select: { id: true },
      }),
    ]);

    if (!tenant) throw new Error("租戶不存在，無法建立基礎資料");
    if (!mainWarehouse) throw new Error("主倉庫建立失敗");

    await tx.posRegister.upsert({
      where: { tenantId_code: { tenantId, code: "POS01" } },
      update: { warehouseId: mainWarehouse.id, isActive: true },
      create: {
        tenantId,
        warehouseId: mainWarehouse.id,
        code: "POS01",
        name: "第一收銀台",
      },
    });

    if (!companySetting) {
      await tx.companySetting.create({
        data: { tenantId, name: "我的公司", currency: "TWD" },
      });
    }

    if (tenant.businessMode === "POS_RESTAURANT") {
      const diningArea = await tx.restaurantArea.upsert({
        where: { tenantId_code: { tenantId, code: "DINING" } },
        update: { isActive: true },
        create: { tenantId, code: "DINING", name: "用餐區", sortOrder: 1 },
        select: { id: true },
      });

      await tx.restaurantTable.createMany({
        data: Array.from({ length: 8 }, (_, offset) => {
          const index = offset + 1;
          return {
            tenantId,
            areaId: diningArea.id,
            code: `T${String(index).padStart(2, "0")}`,
            name: `${index} 號桌`,
            seats: index <= 2 ? 2 : 4,
            sortOrder: index,
          };
        }),
        skipDuplicates: true,
      });
    }

    await seedOperationalBaseline(tx, {
      tenantId,
      tenantName: tenant.name,
      businessMode: tenant.businessMode,
      isInternal: tenant.isInternal,
      mainWarehouseId: mainWarehouse.id,
    });
  }, { timeout: 30_000 });
}
