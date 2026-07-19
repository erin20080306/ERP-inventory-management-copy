import { prisma } from "./prisma";
import { STANDARD_ACCOUNTS } from "../../prisma/standard-accounts";
import { seedOperationalBaseline } from "./seed-operational-baseline";

/**
 * 為租戶建立預設資料。
 *
 * 初始化由獨立 API 觸發；可獨立執行的大量資料先平行 createMany，
 * 商品、庫存與桌位則在同一 transaction 中批次建立。
 */
export async function seedTenantDefaultsBatched(tenantId: string) {
  await prisma.$transaction(async (tx: any) => {
    const seqs = ["PO", "SO", "QT", "JE", "RP", "SP", "SR", "PR", "ADJ", "TRF", "INV", "DN", "GR", "POS", "PRF", "DINE", "KOT"];

    await Promise.all([
      tx.numberSequence.createMany({
        data: seqs.map((key: string) => ({ tenantId, key, prefix: key })),
        skipDuplicates: true,
      }),
      tx.taxRate.createMany({
        data: [
          { tenantId, code: "VAT5", name: "營業稅 5%", rate: 0.05, region: "TW" },
          { tenantId, code: "ZERO", name: "零稅率", rate: 0, region: "TW" },
        ],
        skipDuplicates: true,
      }),
      tx.warehouse.createMany({
        data: [{ tenantId, code: "WH01", name: "主倉庫" }],
        skipDuplicates: true,
      }),
      tx.chartOfAccount.createMany({
        data: STANDARD_ACCOUNTS.map((account) => ({
          tenantId,
          code: account.code,
          name: account.name,
          type: account.type,
        })),
        skipDuplicates: true,
      }),
    ]);

    const [mainWarehouse, tenant, existingCompanySetting] = await Promise.all([
      tx.warehouse.findFirst({
        where: { tenantId, code: "WH01" },
        select: { id: true },
      }),
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, businessMode: true, isInternal: true },
      }),
      tx.companySetting.findFirst({ where: { tenantId }, select: { id: true } }),
    ]);

    if (!tenant) throw new Error("租戶不存在，無法建立基礎資料");
    if (!mainWarehouse) throw new Error("主倉庫建立失敗");

    const independentWrites: Promise<unknown>[] = [
      tx.posRegister.upsert({
        where: { tenantId_code: { tenantId, code: "POS01" } },
        update: { warehouseId: mainWarehouse.id, isActive: true },
        create: {
          tenantId,
          warehouseId: mainWarehouse.id,
          code: "POS01",
          name: "第一收銀台",
        },
      }),
    ];

    if (!existingCompanySetting) {
      independentWrites.push(tx.companySetting.create({
        data: { tenantId, name: "我的公司", currency: "TWD" },
      }));
    }

    let diningAreaId: string | null = null;
    if (tenant.businessMode === "POS_RESTAURANT") {
      const area = await tx.restaurantArea.upsert({
        where: { tenantId_code: { tenantId, code: "DINING" } },
        update: { isActive: true },
        create: { tenantId, code: "DINING", name: "用餐區", sortOrder: 1 },
        select: { id: true },
      });
      diningAreaId = area.id;
    }

    await Promise.all(independentWrites);

    if (diningAreaId) {
      await tx.restaurantTable.createMany({
        data: Array.from({ length: 8 }, (_, offset) => {
          const index = offset + 1;
          return {
            tenantId,
            areaId: diningAreaId as string,
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
