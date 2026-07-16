import { ApiError } from "./api";
import { prisma } from "./prisma";

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export type AccountingPeriodKey = {
  year: number;
  month: number;
  startDate: Date;
  endDate: Date;
  endDateText: string;
};

export function getAccountingPeriod(date: Date): AccountingPeriodKey {
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "會計日期格式不正確");
  const taipei = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const year = taipei.getUTCFullYear();
  const month = taipei.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    startDate: new Date(Date.UTC(year, month - 1, 1) - TAIPEI_OFFSET_MS),
    endDate: new Date(Date.UTC(year, month, 1) - TAIPEI_OFFSET_MS - 1),
    endDateText: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function parseAccountingPeriodEnd(value: string): AccountingPeriodKey & { entryDate: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ApiError(400, "結帳日期必須為 YYYY-MM-DD");
  const entryDate = new Date(`${value}T12:00:00+08:00`);
  const period = getAccountingPeriod(entryDate);
  if (period.endDateText !== value) {
    throw new ApiError(400, `結帳日期必須是月底：${period.endDateText}`);
  }
  return { ...period, entryDate };
}

export function accountingPeriodLockKey(tenantId: string, date: Date) {
  const period = getAccountingPeriod(date);
  return `accounting-period:${tenantId}:${period.year}-${String(period.month).padStart(2, "0")}`;
}

export async function lockAccountingPeriod(tx: any, tenantId: string, date: Date) {
  const key = accountingPeriodLockKey(tenantId, date);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export async function assertAccountingPeriodOpen(tenantId: string, date: Date, client: any = prisma) {
  const period = getAccountingPeriod(date);
  const record = await client.accountingPeriod.findUnique({
    where: { tenantId_year_month: { tenantId, year: period.year, month: period.month } },
    select: { status: true, closedAt: true },
  });
  if (record?.status === "CLOSED") {
    throw new ApiError(409, `${period.year} 年 ${period.month} 月會計期間已關帳，禁止新增、修改或過帳；如需調整請在開放期間建立反向傳票`);
  }
  return period;
}

export async function lockAndAssertAccountingPeriodOpen(tx: any, tenantId: string, date: Date) {
  await lockAccountingPeriod(tx, tenantId, date);
  return assertAccountingPeriodOpen(tenantId, date, tx);
}
