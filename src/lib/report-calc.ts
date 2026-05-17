import { prisma } from "@/lib/prisma";

export type AccountWithBalance = {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  balance: number;
};

/**
 * 計算所有會計科目在指定期間的試算結餘。
 * @param asOf 結算日期 (預設今日)
 * @param tenantId 租戶ID (必須提供以確保資料隔離)
 */
export async function computeTrialBalance(asOf?: Date, tenantId?: string): Promise<AccountWithBalance[]> {
  const where: any = { entry: { status: "POSTED" } };
  if (asOf) where.entry = { ...where.entry, entryDate: { lte: asOf } };
  if (tenantId) where.entry = { ...where.entry, tenantId };

  const accountWhere: any = {};
  if (tenantId) accountWhere.tenantId = tenantId;

  const accounts = await prisma.chartOfAccount.findMany({
    where: accountWhere,
    include: { lines: { where } },
    orderBy: { code: "asc" },
  });

  return accounts.map((a: any) => {
    const totalDebit = a.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
    const totalCredit = a.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
    const opening = Number(a.openingBalance);
    const debitPos = ["ASSET", "COST", "EXPENSE"].includes(a.type);
    const balance = opening + (debitPos ? totalDebit - totalCredit : totalCredit - totalDebit);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      parentId: a.parentId,
      openingBalance: opening,
      totalDebit,
      totalCredit,
      balance,
    };
  });
}

/** 將科目按代碼前綴 (大分類) 分群。台灣會計慣例：
 *   1xxx 流動資產, 15xx-17xx 固定/無形資產
 *   2xxx 流動負債, 28xx 長期負債
 *   3xxx 權益
 *   4xxx 收入
 *   5xxx 銷貨成本
 *   6xxx-7xxx 營業 / 營業外費用
 */
export function getCompanyName(setting: any): string {
  return setting?.name || "公司名稱";
}

export function periodLabel(start: Date, end: Date): string {
  const f = (d: Date) => `${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return `${f(start)} 至 ${f(end)}`;
}

export function asOfLabel(d: Date): string {
  return `中華民國 ${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
