import { lockAndAssertAccountingPeriodOpen } from "@/lib/accounting-controls";
import { nextNumberFastInTransaction } from "@/lib/number-sequence";

type ShiftJournalInput = {
  tenantId: string;
  userId: string;
  shiftId: string;
  registerCode: string;
  openingCash: number;
  direction: "OPEN" | "CLOSE";
  entryDate?: Date;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function resolveCashAccounts(tx: any, tenantId: string) {
  const accounts = await tx.chartOfAccount.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { name: { in: ["庫存現金", "零用金"] } },
        { code: { in: ["1101", "1102"] } },
      ],
    },
    select: { id: true, code: true, name: true },
  });
  const drawer = accounts.find((account: any) => account.name === "庫存現金")
    ?? accounts.find((account: any) => account.code === "1101");
  const petty = accounts.find((account: any) => account.name === "零用金")
    ?? accounts.find((account: any) => account.code === "1102");
  if (!drawer || !petty || drawer.id === petty.id) {
    throw new Error("缺少「庫存現金」或「零用金」標準會計科目，請先執行公司基礎資料初始化");
  }
  return { drawer, petty };
}

export async function createShiftOpeningCashJournal(tx: any, input: ShiftJournalInput) {
  const amount = roundMoney(input.openingCash);
  if (amount <= 0) return null;
  if (input.direction === "CLOSE") {
    const openingJournal = await tx.journalEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        status: "POSTED",
        summary: { startsWith: "POS 開班零用金轉入", contains: `（班次 ${input.shiftId}）` },
      },
      select: { id: true },
    });
    if (!openingJournal) return null;
  }
  const entryDate = input.entryDate ?? new Date();
  await lockAndAssertAccountingPeriodOpen(tx, input.tenantId, entryDate);
  const { drawer, petty } = await resolveCashAccounts(tx, input.tenantId);
  const isOpen = input.direction === "OPEN";
  const number = await nextNumberFastInTransaction(tx, "JE", input.tenantId);
  const action = isOpen ? "開班零用金轉入" : "結班零用金轉回";
  return tx.journalEntry.create({
    data: {
      tenantId: input.tenantId,
      number,
      entryDate,
      summary: `POS ${action} ${input.registerCode}（班次 ${input.shiftId}）`,
      status: "POSTED",
      createdById: input.userId,
      postedById: input.userId,
      postedAt: entryDate,
      lines: {
        create: [
          {
            accountId: isOpen ? drawer.id : petty.id,
            debit: amount,
            credit: 0,
            memo: `${action} ${input.registerCode}`,
          },
          {
            accountId: isOpen ? petty.id : drawer.id,
            debit: 0,
            credit: amount,
            memo: `${action} ${input.registerCode}`,
          },
        ],
      },
    },
    select: { id: true, number: true },
  });
}
