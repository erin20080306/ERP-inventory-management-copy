import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, audit, requirePermission, requireTenantId } from "@/lib/api";
import { lockAccountingPeriod, parseAccountingPeriodEnd } from "@/lib/accounting-controls";
import { buildClosingDraft } from "@/lib/auto-journal";
import { createPostedJournal } from "@/lib/documents";
import { prisma } from "@/lib/prisma";

const WORKING_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;

export const GET = apiHandler(async () => {
  await requirePermission("accounting.view");
  const tenantId = await requireTenantId();
  const items = await prisma.accountingPeriod.findMany({
    where: { tenantId },
    include: {
      closingJournal: {
        select: {
          id: true,
          number: true,
          entryDate: true,
          reversedAt: true,
          reversal: { select: { id: true, number: true } },
        },
      },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 36,
  });
  return NextResponse.json({ items });
});

async function assertEarlierActiveMonthsClosed(tx: any, tenantId: string, year: number, month: number, startDate: Date) {
  if (month <= 1) return;
  const yearStart = new Date(Date.UTC(year, 0, 1) - 8 * 60 * 60 * 1000);
  const earlierEntries = await tx.journalEntry.findMany({
    where: {
      tenantId,
      status: "POSTED",
      entryDate: { gte: yearStart, lt: startDate },
    },
    select: { entryDate: true },
  });
  const activeMonths: number[] = [...new Set<number>(earlierEntries.map((entry: any) => {
    const taipei = new Date(entry.entryDate.getTime() + 8 * 60 * 60 * 1000);
    return taipei.getUTCMonth() + 1;
  }))];
  if (!activeMonths.length) return;
  const closed = await tx.accountingPeriod.findMany({
    where: { tenantId, year, month: { in: activeMonths }, status: "CLOSED" },
    select: { month: true },
  });
  const closedMonths = new Set(closed.map((record: any) => record.month));
  const missing = activeMonths.filter((value) => !closedMonths.has(value)).sort((a, b) => a - b);
  if (missing.length) {
    throw new ApiError(409, `請先依序完成前期關帳：${missing.map((value) => `${value} 月`).join("、")}`);
  }
}

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("accounting.manage");
  const tenantId = await requireTenantId(session);
  const body = await req.json();
  const action = String(body.action ?? "CLOSE").toUpperCase();
  const period = parseAccountingPeriodEnd(String(body.periodEnd ?? ""));

  if (action === "CLOSE") {
    const isYearEnd = Boolean(body.isYearEnd);
    if (isYearEnd && period.month !== 12) throw new ApiError(400, "年結日期必須為 12 月底");

    const result = await prisma.$transaction(async (tx: any) => {
      await lockAccountingPeriod(tx, tenantId, period.entryDate);
      const existing = await tx.accountingPeriod.findUnique({
        where: { tenantId_year_month: { tenantId, year: period.year, month: period.month } },
      });
      if (existing?.status === "CLOSED") throw new ApiError(409, `${period.year} 年 ${period.month} 月已關帳`);

      const laterClosed = await tx.accountingPeriod.findFirst({
        where: { tenantId, status: "CLOSED", endDate: { gt: period.endDate } },
        orderBy: { endDate: "asc" },
      });
      if (laterClosed) throw new ApiError(409, `已有較後期間 ${laterClosed.year} 年 ${laterClosed.month} 月完成關帳，請先由後往前重開`);

      await assertEarlierActiveMonthsClosed(tx, tenantId, period.year, period.month, period.startDate);

      const pendingCount = await tx.journalEntry.count({
        where: {
          tenantId,
          entryDate: { gte: period.startDate, lte: period.endDate },
          status: { in: [...WORKING_STATUSES] },
        },
      });
      if (pendingCount > 0) {
        throw new ApiError(409, `本期仍有 ${pendingCount} 張未完成過帳的傳票，請先送審、核准並過帳，或將不採用的傳票作廢`);
      }

      const draft = await buildClosingDraft(tenantId, period.endDateText, isYearEnd, tx);
      const totalDebit = draft.lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const closingJournal = totalDebit > 0
        ? await createPostedJournal(
            tx,
            tenantId,
            draft.summary,
            session.user.id,
            draft.lines.map((line) => ({
              code: line.accountCode,
              debit: line.debit,
              credit: line.credit,
              memo: line.memo ?? draft.summary,
            })),
            period.entryDate,
          )
        : null;

      const record = await tx.accountingPeriod.upsert({
        where: { tenantId_year_month: { tenantId, year: period.year, month: period.month } },
        create: {
          tenantId,
          year: period.year,
          month: period.month,
          startDate: period.startDate,
          endDate: period.endDate,
          status: "CLOSED",
          closeType: isYearEnd ? "YEAR_END" : "MONTH_END",
          closingJournalId: closingJournal?.id ?? null,
          closedById: session.user.id,
          closedAt: new Date(),
        },
        update: {
          startDate: period.startDate,
          endDate: period.endDate,
          status: "CLOSED",
          closeType: isYearEnd ? "YEAR_END" : "MONTH_END",
          closingJournalId: closingJournal?.id ?? null,
          closedById: session.user.id,
          closedAt: new Date(),
          reopenedById: null,
          reopenedAt: null,
          reopenReason: null,
        },
      });
      return { record, closingJournal, summary: draft.summary };
    }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

    await audit({
      userId: session.user.id,
      action: "close_period",
      module: "accounting",
      refId: result.record.id,
      detail: `${isYearEnd ? "年結" : "月結"} ${period.endDateText}${result.closingJournal ? ` / ${result.closingJournal.number}` : " / 無損益活動"}`,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "REOPEN") {
    const reason = String(body.reason ?? "").trim();
    if (reason.length < 2) throw new ApiError(400, "請輸入至少 2 個字的重開原因");

    const result = await prisma.$transaction(async (tx: any) => {
      await lockAccountingPeriod(tx, tenantId, period.entryDate);
      const record = await tx.accountingPeriod.findUnique({
        where: { tenantId_year_month: { tenantId, year: period.year, month: period.month } },
        include: {
          closingJournal: {
            include: {
              lines: { include: { account: true } },
              reversal: true,
            },
          },
        },
      });
      if (!record || record.status !== "CLOSED") throw new ApiError(409, `${period.year} 年 ${period.month} 月目前不是關帳狀態`);

      const laterClosed = await tx.accountingPeriod.findFirst({
        where: { tenantId, status: "CLOSED", endDate: { gt: record.endDate } },
        orderBy: { endDate: "desc" },
      });
      if (laterClosed) throw new ApiError(409, `請先重開較後期間：${laterClosed.year} 年 ${laterClosed.month} 月`);

      await tx.accountingPeriod.update({
        where: { id: record.id },
        data: {
          status: "OPEN",
          reopenedById: session.user.id,
          reopenedAt: new Date(),
          reopenReason: reason,
        },
      });

      let reversalJournal = null;
      if (record.closingJournal && !record.closingJournal.reversal && !record.closingJournal.reversedAt) {
        reversalJournal = await createPostedJournal(
          tx,
          tenantId,
          `重開 ${period.year} 年 ${period.month} 月，沖銷 ${record.closingJournal.number}：${reason}`,
          session.user.id,
          record.closingJournal.lines.map((line: any) => ({
            code: line.account.code,
            debit: Number(line.credit),
            credit: Number(line.debit),
            memo: `重開期間沖銷 ${record.closingJournal.number}`,
          })),
          period.entryDate,
        );
        await tx.journalEntry.update({
          where: { id: reversalJournal.id },
          data: { reversalOfId: record.closingJournal.id, reversalReason: reason },
        });
        await tx.journalEntry.update({
          where: { id: record.closingJournal.id },
          data: { reversedById: session.user.id, reversedAt: new Date() },
        });
      }
      return { record: { ...record, status: "OPEN" }, reversalJournal };
    }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

    await audit({
      userId: session.user.id,
      action: "reopen_period",
      module: "accounting",
      refId: result.record.id,
      detail: `${period.endDateText} / ${reason}${result.reversalJournal ? ` / ${result.reversalJournal.number}` : ""}`,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  throw new ApiError(400, "不支援的關帳動作");
});
