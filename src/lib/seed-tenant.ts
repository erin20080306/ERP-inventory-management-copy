import { prisma } from "./prisma";

/**
 * 為新租戶建立預設資料：編號規則、稅率、公司設定、倉庫。
 */
export async function seedTenantDefaults(tenantId: string) {
  // 編號規則
  const seqs = ["PO", "SO", "QT", "JE", "RP", "SP", "SR", "PR", "ADJ", "TRF", "INV"];
  await prisma.numberSequence.createMany({
    data: seqs.map((k) => ({ tenantId, key: k, prefix: k })),
    skipDuplicates: true,
  });

  // 預設稅率
  await prisma.taxRate.createMany({
    data: [
      { tenantId, code: "VAT5", name: "營業稅 5%", rate: 0.05, region: "TW" },
      { tenantId, code: "ZERO", name: "零稅率", rate: 0, region: "TW" },
    ],
    skipDuplicates: true,
  });

  // 預設倉庫
  await prisma.warehouse.createMany({
    data: [{ tenantId, code: "WH01", name: "主倉庫" }],
    skipDuplicates: true,
  });

  // 預設公司設定
  const existing = await prisma.companySetting.findFirst({ where: { tenantId } });
  if (!existing) {
    await prisma.companySetting.create({
      data: { tenantId, name: "我的公司", currency: "TWD" },
    });
  }
}
