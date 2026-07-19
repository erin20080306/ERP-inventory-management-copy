import { prisma } from "./prisma";
import { STANDARD_ACCOUNTS } from "../../prisma/standard-accounts";
import { seedOperationalBaseline } from "./seed-operational-baseline";

/**
 * 為租戶建立預設資料。
 *
 * 初始化由獨立 API 觸發，所有大量資料皆使用 createMany／單一 transaction，
 * 避免註冊與登入流程被逐筆資料庫往返拖慢。
 */
export async function seedTenantDefaultsBatched(tenantId: string) {
  await prisma.$transaction(async (tx: any) => {
    const seqs = ["PO", "SO", "QT", "JE", "RP", "SP", "SR", "PR", "ADJ", "TRF", "INV", "DN", "GR", "POS", "PRF", "DINE", "KOT"];
    await tx.numberSequence.createMany({
      data: seqs.map((key: string) => ({ tenantId, key, prefix: key })),
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

    const mainWarehouse = await tx.warehouse.findFirst({
      where: { tenantId, code: "WH01" },
      select: { id: true },
    });

    if (mainWarehouse) {
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
    }

    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, businessMode: true, isInternal: true },
    });

    if (tenant?.businessMode === "POS_RESTAURANT") {
      const area = await tx.restaurantArea.upsert({
        where: { tenantId_code: { tenantId, code: "DINING" } },
        update: { isActive: true },
        create: { tenantId, code: "DINING", name: "用餐區", sortOrder: 1 },
      });

      await tx.restaurantTable.createMany({
        data: Array.from({ length: 8 }, (_, offset) => {
          const index = offset + 1;
          return {
            tenantId,
            areaId: area.id,
            code: `T${String(index).padStart(2, "0")}`,
            name: `${index} 號桌`,
            seats: index <= 2 ? 2 : 4,
            sortOrder: index,
          };
        }),
        skipDuplicates: true,
      });
    }

    const existingCompanySetting = await tx.companySetting.findFirst({ where: { tenantId } });
    if (!existingCompanySetting) {
      await tx.companySetting.create({
        data: { tenantId, name: "我的公司", currency: "TWD" },
      });
    }

    await tx.chartOfAccount.createMany({
      data: STANDARD_ACCOUNTS.map((account) => ({
        tenantId,
        code: account.code,
        name: account.name,
        type: account.type,
      })),
      skipDuplicates: true,
    });

    if (tenant && mainWarehouse) {
      await seedOperationalBaseline(tx, {
        tenantId,
        tenantName: tenant.name,
        businessMode: tenant.businessMode,
        isInternal: tenant.isInternal,
        mainWarehouseId: mainWarehouse.id,
      });
    }
  }, { timeout: 30_000 });
}
