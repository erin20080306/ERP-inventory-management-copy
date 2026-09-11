"use client";

import useSWR from "swr";
import { AlertTriangle, Package, PieChart, Receipt, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/i18n/use-formatters";
import { SalesTrendChart } from "./trend-chart";
import { PieChartComponent } from "./pie-chart";
import { HorizontalBarChart } from "./horizontal-bar-chart";

type DashboardVisualStats = {
  topProducts: { name: string; subtotal: number }[];
  salesByStatus: { name: string; value: number }[];
  inventoryByWarehouse: { name: string; value: number }[];
  recentSales: Array<{
    id: string;
    number: string;
    total: number | string;
    status: string;
    customer?: { companyName?: string | null } | null;
  }>;
  lowStockList: Array<{
    id: string;
    sku: string;
    name: string;
    total: number;
    safetyStock: number | string;
  }>;
  trend: { date: string; sales: number; purchase: number }[];
};

type DashboardVisualsProps = {
  showSales: boolean;
  showPurchases: boolean;
  showInventory: boolean;
};

async function fetchDashboardVisuals(url: string): Promise<DashboardVisualStats> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "DASHBOARD_CHART_FETCH_FAILED");
  return data;
}

function PulseBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function VisualCardSkeleton() {
  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="rounded-t-lg bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
        <PulseBlock className="h-5 w-44" />
      </CardHeader>
      <CardContent className="space-y-3">
        <PulseBlock className="h-48 w-full" />
        <PulseBlock className="h-4 w-full" />
        <PulseBlock className="h-4 w-4/5" />
      </CardContent>
    </Card>
  );
}

export function DashboardVisuals({ showSales, showPurchases, showInventory }: DashboardVisualsProps) {
  const t = useTranslations("dashboard");
  const f = useFormatters();
  const enabled = showSales || showPurchases || showInventory;
  const { data: stats, error, isLoading } = useSWR<DashboardVisualStats>(
    enabled ? "/api/dashboard/visuals" : null,
    fetchDashboardVisuals,
    { dedupingInterval: 15_000, keepPreviousData: true, revalidateOnFocus: false },
  );

  if (!enabled) return null;
  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-6 text-sm text-destructive">
          {t("chartLoadFailedHint")}
        </CardContent>
      </Card>
    );
  }
  if (isLoading || !stats) {
    return <div className="grid gap-4 lg:grid-cols-2"><VisualCardSkeleton /><VisualCardSkeleton /></div>;
  }

  const trendTitle = showSales && showPurchases
    ? t("salesPurchaseTrend")
    : showSales
      ? t("salesTrend")
      : t("purchaseTrend");

  return (
    <>
      {(showSales || showPurchases) && (
        <div className={`grid gap-4 ${showSales ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}>
          <Card className={`${showSales ? "lg:col-span-2" : ""} border-0 shadow-md`}>
            <CardHeader className="rounded-t-lg bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
              <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-blue-500" />{trendTitle}</CardTitle>
            </CardHeader>
            <CardContent><SalesTrendChart data={stats.trend} /></CardContent>
          </Card>
          {showSales && (
            <Card className="border-0 shadow-md">
              <CardHeader className="rounded-t-lg bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
                <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4 text-emerald-500" />{t("topProducts")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.topProducts.length === 0 && <div className="text-sm text-muted-foreground">{t("noData")}</div>}
                {stats.topProducts.map((product, index) => (
                  <div key={`${product.name}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">{index + 1}</span>
                      <span className="truncate">{product.name}</span>
                    </div>
                    <span className="whitespace-nowrap font-medium">{f.money(product.subtotal)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {showSales && (
          <Card className="border-0 shadow-md">
            <CardHeader className="rounded-t-lg bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
              <CardTitle className="flex items-center gap-2 text-base"><PieChart className="h-4 w-4 text-purple-500" />{t("salesStatusMix")}</CardTitle>
            </CardHeader>
            <CardContent><PieChartComponent data={stats.salesByStatus} /></CardContent>
          </Card>
        )}
        {showInventory && (
          <Card className="border-0 shadow-md">
            <CardHeader className="rounded-t-lg bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
              <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4 text-cyan-500" />{t("inventoryByWarehouse")}</CardTitle>
            </CardHeader>
            <CardContent><HorizontalBarChart data={stats.inventoryByWarehouse} /></CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {showSales && (
          <Card className="border-0 shadow-md">
            <CardHeader className="rounded-t-lg bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
              <CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4 text-blue-500" />{t("recentSales")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>{t("colDocNo")}</TH><TH>{t("colCustomer")}</TH><TH>{t("colAmount")}</TH><TH>{t("colStatus")}</TH></TR></THead>
                <TBody>
                  {stats.recentSales.length === 0 && <TR><TD colSpan={4} className="text-center text-muted-foreground">{t("noData")}</TD></TR>}
                  {stats.recentSales.map((order) => (
                    <TR key={order.id}>
                      <TD className="font-mono text-xs">{order.number}</TD>
                      <TD>{order.customer?.companyName ?? "-"}</TD>
                      <TD>{f.money(order.total)}</TD>
                      <TD><StatusBadge status={order.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {showInventory && (
          <Card className="border-0 shadow-md">
            <CardHeader className="rounded-t-lg bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
              <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-orange-500" />{t("lowStockAlert")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>{t("colSku")}</TH><TH>{t("colProduct")}</TH><TH>{t("colOnHand")}</TH><TH>{t("colSafetyStock")}</TH></TR></THead>
                <TBody>
                  {stats.lowStockList.length === 0 && <TR><TD colSpan={4} className="text-center text-muted-foreground">{t("noLowStock")}</TD></TR>}
                  {stats.lowStockList.map((product) => (
                    <TR key={product.id}>
                      <TD className="font-mono text-xs">{product.sku}</TD>
                      <TD>{product.name}</TD>
                      <TD className="font-medium text-red-600">{f.number(product.total)}</TD>
                      <TD>{f.number(Number(product.safetyStock))}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}