import { prisma } from "./prisma";

// 台灣商業會計法標準會計科目表
const CHART_OF_ACCOUNTS: { code: string; name: string; type: string; parent?: string }[] = [
  // ═══════ 資產 ASSET ═══════
  { code: "1000", name: "資產", type: "ASSET" },
  // 流動資產
  { code: "1100", name: "流動資產", type: "ASSET", parent: "1000" },
  { code: "1101", name: "現金及約當現金", type: "ASSET", parent: "1100" },
  { code: "1102", name: "庫存現金", type: "ASSET", parent: "1100" },
  { code: "1103", name: "零用金", type: "ASSET", parent: "1100" },
  { code: "1110", name: "銀行存款", type: "ASSET", parent: "1100" },
  { code: "1111", name: "銀行存款-活期", type: "ASSET", parent: "1110" },
  { code: "1112", name: "銀行存款-定期", type: "ASSET", parent: "1110" },
  { code: "1120", name: "短期投資", type: "ASSET", parent: "1100" },
  { code: "1130", name: "應收票據", type: "ASSET", parent: "1100" },
  { code: "1140", name: "應收帳款", type: "ASSET", parent: "1100" },
  { code: "1141", name: "應收帳款-一般", type: "ASSET", parent: "1140" },
  { code: "1150", name: "其他應收款", type: "ASSET", parent: "1100" },
  { code: "1160", name: "預付款項", type: "ASSET", parent: "1100" },
  { code: "1170", name: "存貨", type: "ASSET", parent: "1100" },
  { code: "1171", name: "商品存貨", type: "ASSET", parent: "1170" },
  { code: "1172", name: "原料", type: "ASSET", parent: "1170" },
  { code: "1173", name: "在製品", type: "ASSET", parent: "1170" },
  { code: "1174", name: "製成品", type: "ASSET", parent: "1170" },
  { code: "1180", name: "進項稅額", type: "ASSET", parent: "1100" },
  { code: "1190", name: "其他流動資產", type: "ASSET", parent: "1100" },
  // 非流動資產
  { code: "1500", name: "非流動資產", type: "ASSET", parent: "1000" },
  { code: "1510", name: "長期投資", type: "ASSET", parent: "1500" },
  { code: "1600", name: "固定資產", type: "ASSET", parent: "1500" },
  { code: "1601", name: "土地", type: "ASSET", parent: "1600" },
  { code: "1602", name: "房屋及建築", type: "ASSET", parent: "1600" },
  { code: "1603", name: "累計折舊-房屋", type: "ASSET", parent: "1600" },
  { code: "1610", name: "機器設備", type: "ASSET", parent: "1600" },
  { code: "1611", name: "累計折舊-機器", type: "ASSET", parent: "1600" },
  { code: "1620", name: "辦公設備", type: "ASSET", parent: "1600" },
  { code: "1621", name: "累計折舊-辦公設備", type: "ASSET", parent: "1600" },
  { code: "1630", name: "運輸設備", type: "ASSET", parent: "1600" },
  { code: "1631", name: "累計折舊-運輸設備", type: "ASSET", parent: "1600" },
  { code: "1700", name: "無形資產", type: "ASSET", parent: "1500" },
  { code: "1701", name: "商標權", type: "ASSET", parent: "1700" },
  { code: "1702", name: "專利權", type: "ASSET", parent: "1700" },
  { code: "1703", name: "電腦軟體", type: "ASSET", parent: "1700" },
  { code: "1800", name: "其他資產", type: "ASSET", parent: "1500" },
  { code: "1801", name: "存出保證金", type: "ASSET", parent: "1800" },
  { code: "1802", name: "遞延資產", type: "ASSET", parent: "1800" },

  // ═══════ 負債 LIABILITY ═══════
  { code: "2000", name: "負債", type: "LIABILITY" },
  // 流動負債
  { code: "2100", name: "流動負債", type: "LIABILITY", parent: "2000" },
  { code: "2110", name: "短期借款", type: "LIABILITY", parent: "2100" },
  { code: "2120", name: "應付票據", type: "LIABILITY", parent: "2100" },
  { code: "2130", name: "應付帳款", type: "LIABILITY", parent: "2100" },
  { code: "2131", name: "應付帳款-一般", type: "LIABILITY", parent: "2130" },
  { code: "2140", name: "預收款項", type: "LIABILITY", parent: "2100" },
  { code: "2150", name: "應付費用", type: "LIABILITY", parent: "2100" },
  { code: "2151", name: "應付薪資", type: "LIABILITY", parent: "2150" },
  { code: "2152", name: "應付租金", type: "LIABILITY", parent: "2150" },
  { code: "2160", name: "應付稅款", type: "LIABILITY", parent: "2100" },
  { code: "2161", name: "應付營業稅", type: "LIABILITY", parent: "2160" },
  { code: "2162", name: "應付所得稅", type: "LIABILITY", parent: "2160" },
  { code: "2170", name: "銷項稅額", type: "LIABILITY", parent: "2100" },
  { code: "2180", name: "其他應付款", type: "LIABILITY", parent: "2100" },
  { code: "2190", name: "其他流動負債", type: "LIABILITY", parent: "2100" },
  // 非流動負債
  { code: "2500", name: "非流動負債", type: "LIABILITY", parent: "2000" },
  { code: "2510", name: "長期借款", type: "LIABILITY", parent: "2500" },
  { code: "2520", name: "存入保證金", type: "LIABILITY", parent: "2500" },
  { code: "2590", name: "其他非流動負債", type: "LIABILITY", parent: "2500" },

  // ═══════ 權益 EQUITY ═══════
  { code: "3000", name: "權益", type: "EQUITY" },
  { code: "3100", name: "股本", type: "EQUITY", parent: "3000" },
  { code: "3110", name: "普通股股本", type: "EQUITY", parent: "3100" },
  { code: "3200", name: "資本公積", type: "EQUITY", parent: "3000" },
  { code: "3300", name: "保留盈餘", type: "EQUITY", parent: "3000" },
  { code: "3310", name: "法定盈餘公積", type: "EQUITY", parent: "3300" },
  { code: "3320", name: "特別盈餘公積", type: "EQUITY", parent: "3300" },
  { code: "3350", name: "未分配盈餘", type: "EQUITY", parent: "3300" },
  { code: "3400", name: "本期損益", type: "EQUITY", parent: "3000" },
  { code: "3500", name: "業主資本", type: "EQUITY", parent: "3000" },
  { code: "3600", name: "業主往來", type: "EQUITY", parent: "3000" },

  // ═══════ 收入 REVENUE ═══════
  { code: "4000", name: "營業收入", type: "REVENUE" },
  { code: "4100", name: "銷貨收入", type: "REVENUE", parent: "4000" },
  { code: "4110", name: "銷貨收入-內銷", type: "REVENUE", parent: "4100" },
  { code: "4120", name: "銷貨收入-外銷", type: "REVENUE", parent: "4100" },
  { code: "4170", name: "銷貨退回", type: "REVENUE", parent: "4000" },
  { code: "4180", name: "銷貨折讓", type: "REVENUE", parent: "4000" },
  { code: "4200", name: "勞務收入", type: "REVENUE", parent: "4000" },
  { code: "4900", name: "其他營業收入", type: "REVENUE", parent: "4000" },
  // 營業外收入
  { code: "7100", name: "營業外收入", type: "REVENUE" },
  { code: "7110", name: "利息收入", type: "REVENUE", parent: "7100" },
  { code: "7120", name: "租金收入", type: "REVENUE", parent: "7100" },
  { code: "7130", name: "處分資產利益", type: "REVENUE", parent: "7100" },
  { code: "7140", name: "匯兌利益", type: "REVENUE", parent: "7100" },
  { code: "7190", name: "其他營業外收入", type: "REVENUE", parent: "7100" },

  // ═══════ 成本 COST ═══════
  { code: "5000", name: "營業成本", type: "COST" },
  { code: "5100", name: "銷貨成本", type: "COST", parent: "5000" },
  { code: "5110", name: "進貨", type: "COST", parent: "5100" },
  { code: "5120", name: "進貨退出", type: "COST", parent: "5100" },
  { code: "5130", name: "進貨折讓", type: "COST", parent: "5100" },
  { code: "5140", name: "進貨運費", type: "COST", parent: "5100" },
  { code: "5150", name: "存貨變動", type: "COST", parent: "5100" },
  { code: "5200", name: "勞務成本", type: "COST", parent: "5000" },

  // ═══════ 費用 EXPENSE ═══════
  { code: "6000", name: "營業費用", type: "EXPENSE" },
  // 管理費用
  { code: "6100", name: "管理費用", type: "EXPENSE", parent: "6000" },
  { code: "6101", name: "薪資支出", type: "EXPENSE", parent: "6100" },
  { code: "6102", name: "租金支出", type: "EXPENSE", parent: "6100" },
  { code: "6103", name: "文具用品", type: "EXPENSE", parent: "6100" },
  { code: "6104", name: "旅費", type: "EXPENSE", parent: "6100" },
  { code: "6105", name: "運費", type: "EXPENSE", parent: "6100" },
  { code: "6106", name: "郵電費", type: "EXPENSE", parent: "6100" },
  { code: "6107", name: "修繕費", type: "EXPENSE", parent: "6100" },
  { code: "6108", name: "水電瓦斯費", type: "EXPENSE", parent: "6100" },
  { code: "6109", name: "保險費", type: "EXPENSE", parent: "6100" },
  { code: "6110", name: "交際費", type: "EXPENSE", parent: "6100" },
  { code: "6111", name: "捐贈", type: "EXPENSE", parent: "6100" },
  { code: "6112", name: "稅捐", type: "EXPENSE", parent: "6100" },
  { code: "6113", name: "折舊費用", type: "EXPENSE", parent: "6100" },
  { code: "6114", name: "各項攤提", type: "EXPENSE", parent: "6100" },
  { code: "6115", name: "伙食費", type: "EXPENSE", parent: "6100" },
  { code: "6116", name: "勞務費", type: "EXPENSE", parent: "6100" },
  { code: "6117", name: "訓練費", type: "EXPENSE", parent: "6100" },
  { code: "6118", name: "勞健保費", type: "EXPENSE", parent: "6100" },
  { code: "6119", name: "退休金", type: "EXPENSE", parent: "6100" },
  { code: "6190", name: "其他管理費用", type: "EXPENSE", parent: "6100" },
  // 推銷費用
  { code: "6200", name: "推銷費用", type: "EXPENSE", parent: "6000" },
  { code: "6201", name: "廣告費", type: "EXPENSE", parent: "6200" },
  { code: "6202", name: "推銷員薪資", type: "EXPENSE", parent: "6200" },
  { code: "6203", name: "佣金支出", type: "EXPENSE", parent: "6200" },
  { code: "6204", name: "樣品費", type: "EXPENSE", parent: "6200" },
  { code: "6290", name: "其他推銷費用", type: "EXPENSE", parent: "6200" },
  // 營業外支出
  { code: "7500", name: "營業外支出", type: "EXPENSE" },
  { code: "7510", name: "利息支出", type: "EXPENSE", parent: "7500" },
  { code: "7520", name: "處分資產損失", type: "EXPENSE", parent: "7500" },
  { code: "7530", name: "匯兌損失", type: "EXPENSE", parent: "7500" },
  { code: "7590", name: "其他營業外支出", type: "EXPENSE", parent: "7500" },
  // 所得稅
  { code: "8000", name: "所得稅費用", type: "EXPENSE" },
  { code: "8100", name: "營利事業所得稅", type: "EXPENSE", parent: "8000" },
];

/**
 * 為新租戶建立預設資料：編號規則、稅率、公司設定、倉庫、標準會計科目。
 */
export async function seedTenantDefaults(tenantId: string) {
  // 編號規則
  const seqs = ["PO", "SO", "QT", "JE", "RP", "SP", "SR", "PR", "ADJ", "TRF", "INV", "DN"];
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

  // 標準會計科目表（台灣商業會計法）
  const existingAccounts = await prisma.chartOfAccount.count({ where: { tenantId } });
  if (existingAccounts === 0) {
    // 批量建立所有科目
    await prisma.chartOfAccount.createMany({
      data: CHART_OF_ACCOUNTS.map((a) => ({
        tenantId,
        code: a.code,
        name: a.name,
        type: a.type as any,
      })),
      skipDuplicates: true,
    });
    // 查回所有科目取得 id
    const all = await prisma.chartOfAccount.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    const idMap = Object.fromEntries(all.map((a) => [a.code, a.id]));
    // 批量更新 parentId（用 transaction 一次送出）
    const updates = CHART_OF_ACCOUNTS
      .filter((a) => a.parent && idMap[a.parent])
      .map((a) =>
        prisma.chartOfAccount.update({
          where: { id: idMap[a.code] },
          data: { parentId: idMap[a.parent!] },
        })
      );
    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }
  }
}
