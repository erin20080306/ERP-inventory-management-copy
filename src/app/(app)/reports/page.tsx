import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Printer, FileText, Scale, BookOpen } from "lucide-react";
import { requireTenantId } from "@/lib/api";
import { ReportDateFilter } from "./date-filter";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const g = await requirePermissionOrForbidden("reports.view");
  if (g.forbidden) return g.element;
  const tenantId = await requireTenantId();
  
  const fromDate = searchParams.from;
  const toDate = searchParams.to;
  const dateFilter = fromDate || toDate;
  const dateRangeLabel = dateFilter ? `${fromDate || "開始"} ~ ${toDate || "今天"}` : "全部期間";

  // 構建日期篩選條件
  const dateWhere: any = dateFilter ? {
    entry: { entryDate: {} },
  } : {};
  if (fromDate) dateWhere.entry.entryDate.gte = new Date(fromDate);
  if (toDate) dateWhere.entry.entryDate.lte = new Date(toDate);

  const accounts = await prisma.chartOfAccount.findMany({
    where: { tenantId },
    include: { 
      lines: { 
        where: dateFilter ? dateWhere.entry : { entry: { status: "POSTED" } },
      } 
    },
    orderBy: { code: "asc" },
  });

  const trial = accounts.map((a: any) => {
    const totalDebit = a.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
    const totalCredit = a.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
    const opening = Number(a.openingBalance);
    // 資產/成本/費用 = debit - credit；其它 = credit - debit
    const debitPos = ["ASSET", "COST", "EXPENSE"].includes(a.type);
    const balance = opening + (debitPos ? totalDebit - totalCredit : totalCredit - totalDebit);
    return { ...a, totalDebit, totalCredit, balance };
  });

  // 損益表
  const revenue = trial.filter((a: any) => a.type === "REVENUE").reduce((s: number, a: any) => s + a.balance, 0);
  const cost = trial.filter((a: any) => a.type === "COST").reduce((s: number, a: any) => s + a.balance, 0);
  const expense = trial.filter((a: any) => a.type === "EXPENSE").reduce((s: number, a: any) => s + a.balance, 0);
  const netIncome = revenue - cost - expense;

  // 資產負債
  const asset = trial.filter((a: any) => a.type === "ASSET").reduce((s: number, a: any) => s + a.balance, 0);
  const liability = trial.filter((a: any) => a.type === "LIABILITY").reduce((s: number, a: any) => s + a.balance, 0);
  const equity = trial.filter((a: any) => a.type === "EQUITY").reduce((s: number, a: any) => s + a.balance, 0) + netIncome;

  // 銷售 / 採購 / 毛利（加入日期篩選）
  const salesWhere: any = { tenantId, status: { not: "CANCELLED" } };
  const purchaseWhere: any = { tenantId, status: { not: "CANCELLED" } };
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

  const typeLabel: Record<string, string> = { ASSET: "資產", LIABILITY: "負債", EQUITY: "權益", REVENUE: "收入", COST: "成本", EXPENSE: "費用" };

  return (
    <PageShell title={`財務報表 (${dateRangeLabel})`} description="損益表、資產負債表、試算表與進銷存總覽">
      <ReportDateFilter />
      {/* 列印入口卡 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />列印正式報表</CardTitle>
          <CardDescription>一鍵列印符合一般公認會計原則 (GAAP) 格式之資產負債表、損益表與試算表</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/print/balance-sheet">
            <Button variant="outline" className="w-full justify-start h-auto py-3">
              <Scale className="h-5 w-5" />
              <div className="text-left ml-1">
                <div className="font-semibold">資產負債表</div>
                <div className="text-xs text-muted-foreground">Balance Sheet</div>
              </div>
            </Button>
          </Link>
          <Link href="/print/income-statement">
            <Button variant="outline" className="w-full justify-start h-auto py-3">
              <FileText className="h-5 w-5" />
              <div className="text-left ml-1">
                <div className="font-semibold">綜合損益表</div>
                <div className="text-xs text-muted-foreground">Income Statement</div>
              </div>
            </Button>
          </Link>
          <Link href="/print/trial-balance">
            <Button variant="outline" className="w-full justify-start h-auto py-3">
              <BookOpen className="h-5 w-5" />
              <div className="text-left ml-1">
                <div className="font-semibold">試算表</div>
                <div className="text-xs text-muted-foreground">Trial Balance</div>
              </div>
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>本期損益</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>收入</span><span className="font-medium">{formatMoney(revenue)}</span></div>
            <div className="flex justify-between"><span>銷貨成本</span><span className="font-medium">{formatMoney(cost)}</span></div>
            <div className="flex justify-between"><span>費用</span><span className="font-medium">{formatMoney(expense)}</span></div>
            <div className="flex justify-between border-t pt-2 text-base"><span className="font-bold">淨利</span><span className={`font-bold ${netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatMoney(netIncome)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>資產負債</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>資產</span><span className="font-medium">{formatMoney(asset)}</span></div>
            <div className="flex justify-between"><span>負債</span><span className="font-medium">{formatMoney(liability)}</span></div>
            <div className="flex justify-between"><span>權益</span><span className="font-medium">{formatMoney(equity)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-bold">負債 + 權益</span><span className="font-bold">{formatMoney(liability + equity)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>營運摘要</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>累計銷售</span><span className="font-medium">{formatMoney(Number(salesTotal._sum.total ?? 0))}</span></div>
            <div className="flex justify-between"><span>累計採購</span><span className="font-medium">{formatMoney(Number(purchaseTotal._sum.total ?? 0))}</span></div>
            <div className="flex justify-between"><span>庫存總成本</span><span className="font-medium">{formatMoney(inventoryValue)}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>試算表 Trial Balance</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>科目編號</TH><TH>科目名稱</TH><TH>類型</TH><TH>期初</TH><TH>借方</TH><TH>貸方</TH><TH>結餘</TH></TR></THead>
            <TBody>
              {trial.map((a: any) => (
                <TR key={a.id}>
                  <TD className="font-mono text-xs">{a.code}</TD>
                  <TD>{a.name}</TD>
                  <TD>{typeLabel[a.type]}</TD>
                  <TD>{formatMoney(a.openingBalance)}</TD>
                  <TD>{formatMoney(a.totalDebit)}</TD>
                  <TD>{formatMoney(a.totalCredit)}</TD>
                  <TD className="font-medium">{formatMoney(a.balance)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
