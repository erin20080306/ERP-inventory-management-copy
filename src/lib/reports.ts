import { prisma } from "@/lib/prisma";

export type TrialBalanceRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  balance: number;
};

export async function getFinancialReportData(tenantId: string, fromDate?: string | null, toDate?: string | null) {
  const dateFilter = fromDate || toDate;
  const dateWhere: any = dateFilter ? { entry: { entryDate: {} } } : {};

  if (fromDate) dateWhere.entry.entryDate.gte = new Date(fromDate);
  if (toDate) dateWhere.entry.entryDate.lte = new Date(toDate);

  const accounts = await prisma.chartOfAccount.findMany({
    where: { tenantId },
    include: {
      lines: {
        where: dateFilter ? dateWhere.entry : { entry: { status: "POSTED" } },
      },
    },
    orderBy: { code: "asc" },
  });

  const trial: TrialBalanceRow[] = accounts.map((a: any) => {
    const totalDebit = a.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
    const totalCredit = a.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
    const openingBalance = Number(a.openingBalance);
    const debitPos = ["ASSET", "COST", "EXPENSE"].includes(a.type);
    const balance = openingBalance + (debitPos ? totalDebit - totalCredit : totalCredit - totalDebit);

    return {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      openingBalance,
      totalDebit,
      totalCredit,
      balance,
    };
  });

  const revenue = trial.filter((a) => a.type === "REVENUE").reduce((s, a) => s + a.balance, 0);
  const cost = trial.filter((a) => a.type === "COST").reduce((s, a) => s + a.balance, 0);
  const expense = trial.filter((a) => a.type === "EXPENSE").reduce((s, a) => s + a.balance, 0);
  const netIncome = revenue - cost - expense;

  const asset = trial.filter((a) => a.type === "ASSET").reduce((s, a) => s + a.balance, 0);
  const liability = trial.filter((a) => a.type === "LIABILITY").reduce((s, a) => s + a.balance, 0);
  const equity = trial.filter((a) => a.type === "EQUITY").reduce((s, a) => s + a.balance, 0) + netIncome;

  const salesWhere: any = { tenantId, status: { not: "VOIDED" } };
  const purchaseWhere: any = { tenantId, status: { not: "VOIDED" } };
  if (fromDate) {
    salesWhere.createdAt = { ...salesWhere.createdAt, gte: new Date(fromDate) };
    purchaseWhere.createdAt = { ...purchaseWhere.createdAt, gte: new Date(fromDate) };
  }
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    salesWhere.createdAt = { ...salesWhere.createdAt, lte: end };
    purchaseWhere.createdAt = { ...purchaseWhere.createdAt, lte: end };
  }

  const [salesTotal, purchaseTotal, stocks] = await Promise.all([
    prisma.salesOrder.aggregate({ _sum: { total: true }, where: salesWhere }),
    prisma.purchaseOrder.aggregate({ _sum: { total: true }, where: purchaseWhere }),
    prisma.inventoryStock.findMany({ where: { tenantId }, include: { product: true } }),
  ]);
  const inventoryValue = stocks.reduce((s: number, x: any) => s + Number(x.quantity) * Number(x.product.costPrice), 0);

  return {
    trial,
    revenue,
    cost,
    expense,
    netIncome,
    asset,
    liability,
    equity,
    salesTotal: Number(salesTotal._sum.total ?? 0),
    purchaseTotal: Number(purchaseTotal._sum.total ?? 0),
    inventoryValue,
  };
}
