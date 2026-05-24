"use client";

import { AlertTriangle, Package, PieChart, Receipt, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney, formatNumber } from "@/lib/utils";
import { SalesTrendChart } from "./trend-chart";
import { PieChartComponent } from "./pie-chart";
import { HorizontalBarChart } from "./horizontal-bar-chart";

type DashboardVisualsProps = {
  stats: {
    topProducts: { name: string; subtotal: number }[];
    salesByStatus: { name: string; value: number }[];
    inventoryByWarehouse: { name: string; value: number }[];
    recentSales: any[];
    lowStockList: any[];
    trend: { date: string; sales: number; purchase: number }[];
  };
};

export function DashboardVisuals({ stats: s }: DashboardVisualsProps) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 shadow-md border-0">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-500" />近 14 日銷售 / 採購趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={s.trend} />
          </CardContent>
        </Card>
        <Card className="shadow-md border-0">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-emerald-500" />商品銷售排行</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.topProducts.length === 0 && <div className="text-sm text-muted-foreground">尚無資料</div>}
            {s.topProducts.map((p, i) => (
              <div key={`${p.name}-${i}`} className="flex items-center justify-between text-sm gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</span>
                  <span className="truncate">{p.name}</span>
                </div>
                <span className="font-medium whitespace-nowrap">{formatMoney(p.subtotal)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-md border-0">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2"><PieChart className="h-4 w-4 text-purple-500" />銷售單狀態分佈</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={s.salesByStatus} />
          </CardContent>
        </Card>
        <Card className="shadow-md border-0">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-cyan-500" />庫存分佈（按倉庫）</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart data={s.inventoryByWarehouse} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-md border-0">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-blue-500" />最近銷售單</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>單號</TH>
                  <TH>客戶</TH>
                  <TH>金額</TH>
                  <TH>狀態</TH>
                </TR>
              </THead>
              <TBody>
                {s.recentSales.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      尚無資料
                    </TD>
                  </TR>
                )}
                {s.recentSales.map((o) => (
                  <TR key={o.id}>
                    <TD className="font-mono text-xs">{o.number}</TD>
                    <TD>{o.customer.companyName}</TD>
                    <TD>{formatMoney(o.total)}</TD>
                    <TD>
                      <StatusBadge status={o.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="shadow-md border-0">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />低庫存警示</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>SKU</TH>
                  <TH>商品</TH>
                  <TH>目前庫存</TH>
                  <TH>安全庫存</TH>
                </TR>
              </THead>
              <TBody>
                {s.lowStockList.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      沒有低庫存商品
                    </TD>
                  </TR>
                )}
                {s.lowStockList.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.sku}</TD>
                    <TD>{p.name}</TD>
                    <TD className="text-red-600 font-medium">{formatNumber(p.total)}</TD>
                    <TD>{formatNumber(Number(p.safetyStock))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
