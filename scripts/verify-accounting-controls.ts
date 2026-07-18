import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { buildClosingDraft } from "../src/lib/auto-journal";
import { createPostedJournal } from "../src/lib/documents";
import { seedTenantDefaults } from "../src/lib/seed-tenant";
import { assertTestDatabase } from "./assert-test-database";

assertTestDatabase(/^erp_accounting_test_[a-z0-9_]+$/, "erp_accounting_test_*");

function atTaipei(value: string) {
  return new Date(`${value}T12:00:00+08:00`);
}

function amountByCode(draft: Awaited<ReturnType<typeof buildClosingDraft>>, code: string) {
  return draft.lines
    .filter((line) => line.accountCode === code)
    .reduce((total, line) => ({ debit: total.debit + line.debit, credit: total.credit + line.credit }), { debit: 0, credit: 0 });
}

async function fixture(name: string) {
  const tenant = await prisma.tenant.create({ data: { name } });
  await seedTenantDefaults(tenant.id);
  const maker = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: `maker-${tenant.id}`,
      email: `maker-${tenant.id}@example.invalid`,
      name: "製單人員",
      passwordHash: "not-a-real-password-hash",
    },
  });
  return { tenant, maker };
}

async function posted(tenantId: string, userId: string, summary: string, date: string, lines: Array<{ code: string; debit?: number; credit?: number }>) {
  return prisma.$transaction((tx: any) => createPostedJournal(
    tx,
    tenantId,
    summary,
    userId,
    lines.map((line) => ({ ...line, memo: summary })),
    atTaipei(date),
  ));
}

async function main() {
  const july = await fixture("會計期間鎖定測試");
  await posted(july.tenant.id, july.maker.id, "7 月銷貨", "2026-07-10", [
    { code: "1101", debit: 1000 },
    { code: "4101", credit: 1000 },
  ]);
  await posted(july.tenant.id, july.maker.id, "7 月銷貨成本", "2026-07-10", [
    { code: "5101", debit: 300 },
    { code: "1201", credit: 300 },
  ]);
  await posted(july.tenant.id, july.maker.id, "7 月薪資", "2026-07-20", [
    { code: "6101", debit: 200 },
    { code: "1101", credit: 200 },
  ]);

  const julyDraft = await buildClosingDraft(july.tenant.id, "2026-07-31");
  assert.deepEqual(amountByCode(julyDraft, "4101"), { debit: 1000, credit: 0 });
  assert.deepEqual(amountByCode(julyDraft, "5101"), { debit: 0, credit: 300 });
  assert.deepEqual(amountByCode(julyDraft, "6101"), { debit: 0, credit: 200 });
  assert.deepEqual(amountByCode(julyDraft, "3402"), { debit: 500, credit: 1000 });

  const closing = await prisma.$transaction((tx: any) => createPostedJournal(
    tx,
    july.tenant.id,
    julyDraft.summary,
    july.maker.id,
    julyDraft.lines.map((line) => ({ code: line.accountCode, debit: line.debit, credit: line.credit, memo: line.memo ?? julyDraft.summary })),
    atTaipei("2026-07-31"),
  ));
  await prisma.accountingPeriod.create({
    data: {
      tenantId: july.tenant.id,
      year: 2026,
      month: 7,
      startDate: new Date("2026-06-30T16:00:00.000Z"),
      endDate: new Date("2026-07-31T15:59:59.999Z"),
      status: "CLOSED",
      closeType: "MONTH_END",
      closingJournalId: closing.id,
      closedById: july.maker.id,
      closedAt: new Date(),
    },
  });

  await assert.rejects(
    posted(july.tenant.id, july.maker.id, "不得補登 7 月", "2026-07-25", [
      { code: "1101", debit: 1 },
      { code: "4101", credit: 1 },
    ]),
    /已關帳/,
  );

  await prisma.accountingPeriod.update({
    where: { tenantId_year_month: { tenantId: july.tenant.id, year: 2026, month: 7 } },
    data: { status: "OPEN", reopenedById: july.maker.id, reopenedAt: new Date(), reopenReason: "補登漏列發票" },
  });
  const closingWithLines = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: closing.id },
    include: { lines: { include: { account: true } } },
  });
  const reversal = await posted(
    july.tenant.id,
    july.maker.id,
    `重開 7 月沖銷 ${closing.number}`,
    "2026-07-31",
    closingWithLines.lines.map((line) => ({ code: line.account.code, debit: Number(line.credit), credit: Number(line.debit) })),
  );
  await prisma.$transaction([
    prisma.journalEntry.update({ where: { id: reversal.id }, data: { reversalOfId: closing.id, reversalReason: "補登漏列發票" } }),
    prisma.journalEntry.update({ where: { id: closing.id }, data: { reversedById: july.maker.id, reversedAt: new Date() } }),
  ]);
  const rebuiltJuly = await buildClosingDraft(july.tenant.id, "2026-07-31");
  assert.deepEqual(amountByCode(rebuiltJuly, "3402"), { debit: 500, credit: 1000 });
  assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: reversal.id } })).reversalOfId, closing.id);
  assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: closing.id } })).status, "POSTED");

  const year = await fixture("年結測試");
  await posted(year.tenant.id, year.maker.id, "1 月收入", "2026-01-05", [
    { code: "1101", debit: 1000 },
    { code: "4101", credit: 1000 },
  ]);
  await posted(year.tenant.id, year.maker.id, "1 月成本", "2026-01-05", [
    { code: "5101", debit: 500 },
    { code: "1201", credit: 500 },
  ]);
  const januaryDraft = await buildClosingDraft(year.tenant.id, "2026-01-31");
  await prisma.$transaction((tx: any) => createPostedJournal(
    tx,
    year.tenant.id,
    januaryDraft.summary,
    year.maker.id,
    januaryDraft.lines.map((line) => ({ code: line.accountCode, debit: line.debit, credit: line.credit, memo: line.memo ?? januaryDraft.summary })),
    atTaipei("2026-01-31"),
  ));
  await posted(year.tenant.id, year.maker.id, "12 月收入", "2026-12-05", [
    { code: "1101", debit: 800 },
    { code: "4101", credit: 800 },
  ]);
  await posted(year.tenant.id, year.maker.id, "12 月成本", "2026-12-05", [
    { code: "5101", debit: 300 },
    { code: "1201", credit: 300 },
  ]);
  const yearDraft = await buildClosingDraft(year.tenant.id, "2026-12-31", true);
  assert.deepEqual(amountByCode(yearDraft, "3401"), { debit: 0, credit: 1000 });
  assert.match(yearDraft.summary, /全年損益1000/);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    monthlyNetIncome: 500,
    closedPeriodWriteBlocked: true,
    reopenUsesReversalJournal: true,
    postedOriginalPreserved: true,
    annualNetIncome: 1000,
  }, null, 2)}\n`);
}

main().finally(async () => prisma.$disconnect());
