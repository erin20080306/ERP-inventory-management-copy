"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { readSessionCache, writeSessionCache } from "@/components/table-helpers";
import { formatMoney } from "@/lib/utils";

type TrialBalanceRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  balance: number;
};

type ReportData = {
  trial: TrialBalanceRow[];
  revenue: number;
  cost: number;
  expense: number;
  netIncome: number;
  asset: number;
  liability: number;
  equity: number;
  salesTotal: number;
  purchaseTotal: number;
  inventoryValue: number;
};

const typeLabel: Record<string, string> = {
  ASSET: "資產",
  LIABILITY: "負債",
  EQUITY: "權益",
  REVENUE: "收入",
  COST: "成本",
  EXPENSE: "費用",
};

async function fetchReportData(url: string): Promise<ReportData> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "報表資料載入失敗");
  return data;
}

function PulseBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function ReportContentSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardHeader><PulseBlock className="h-5 w-24" /></CardHeader>
            <CardContent className="space-y-3">
              <PulseBlock className="h-4 w-full" />
              <PulseBlock className="h-4 w-11/12" />
              <PulseBlock className="h-4 w-10/12" />
              <PulseBlock className="h-5 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><PulseBlock className="h-5 w-44" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <PulseBlock key={index} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    </>
  );
}

export function ReportContent() {
  const searchParams = useSearchParams();
  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    return query ? `/api/reports/summary?${query}` : "/api/reports/summary";
  }, [searchParams]);
  const cacheKey = `reports:${reportUrl}`;
  const cachedData = useMemo(() => readSessionCache<ReportData>(cacheKey), [cacheKey]);

  const { data, error, isLoading } = useSWR<ReportData>(reportUrl, fetchReportData, {
    dedupingInterval: 15_000,
    fallbackData: cachedData,
    keepPreviousData: true,
    onSuccess: (nextData) => writeSessionCache(cacheKey, nextData),
    revalidateOnFocus: false,
  });

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-6 text-sm text-destructive">
          報表資料載入失敗。請重新查詢或整理頁面再試一次。
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) return <ReportContentSkeleton />;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>本期損益</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>收入</span><span className="font-medium">{formatMoney(data.revenue)}</span></div>
            <div className="flex justify-between"><span>銷貨成本</span><span className="font-medium">{formatMoney(data.cost)}</span></div>
            <div className="flex justify-between"><span>費用</span><span className="font-medium">{formatMoney(data.expense)}</span></div>
            <div className="flex justify-between border-t pt-2 text-base"><span className="font-bold">淨利</span><span className={`font-bold ${data.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatMoney(data.netIncome)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>資產負債</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>資產</span><span className="font-medium">{formatMoney(data.asset)}</span></div>
            <div className="flex justify-between"><span>負債</span><span className="font-medium">{formatMoney(data.liability)}</span></div>
            <div className="flex justify-between"><span>權益</span><span className="font-medium">{formatMoney(data.equity)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-bold">負債 + 權益</span><span className="font-bold">{formatMoney(data.liability + data.equity)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>營運摘要</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>累計銷售</span><span className="font-medium">{formatMoney(data.salesTotal)}</span></div>
            <div className="flex justify-between"><span>累計採購</span><span className="font-medium">{formatMoney(data.purchaseTotal)}</span></div>
            <div className="flex justify-between"><span>庫存總成本</span><span className="font-medium">{formatMoney(data.inventoryValue)}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>試算表 Trial Balance</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>科目編號</TH><TH>科目名稱</TH><TH>類型</TH><TH>期初</TH><TH>借方</TH><TH>貸方</TH><TH>結餘</TH></TR></THead>
            <TBody>
              {data.trial.map((a) => (
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
    </>
  );
}
