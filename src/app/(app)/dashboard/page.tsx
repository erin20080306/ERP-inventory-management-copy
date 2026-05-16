import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatNumber } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Package, AlertTriangle, ShoppingCart, Receipt, Coins, Wallet } from "lucide-react";
import { SalesTrendChart } from "./trend-chart";
import { requireTenantId } from "@/lib/api";

export const dynamic = "force-dynamic";

async function getStats(tenantId: string) {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    todaySales,
    monthSales,
    monthPurchase,
    arOpen,
    apOpen,
    inventoryValue,
    lowStock,
    unshipped,
    unpaidPO,
    recentSales,
    topProducts,
    topCustomers,
  ] = await Promise.all([
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, orderDate: { gte: startToday }, status: { not: "CANCELLED" } },
    }),
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, orderDate: { gte: startMonth }, status: { not: "CANCELLED" } },
    }),
    prisma.purchaseOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, orderDate: { gte: startMonth }, status: { not: "CANCELLED" } },
    }),
    prisma.accountsReceivable.aggregate({ _sum: { amount: true, paidAmount: true }, where: { tenantId, status: { not: "PAID" } } }),
    prisma.accountsPayable.aggregate({ _sum: { amount: true, paidAmount: true }, where: { tenantId, status: { not: "PAID" } } }),
    (prisma.$queryRawUnsafe as any)(
      `SELECT COALESCE(SUM(s.quantity * p."costPrice"),0) as total FROM "InventoryStock" s JOIN "Product" p ON p.id = s."productId" WHERE s."tenantId" = $1`,
      tenantId
    ) as Promise<{ total: any }[]>,
    prisma.product.findMany({
      where: { tenantId, isActive: true },
      include: { stocks: true },
      take: 100,
    }),
    prisma.salesOrder.count({ where: { tenantId, status: { in: ["DRAFT", "CONFIRMED"] } } }),
    prisma.purchaseOrder.count({ where: { tenantId, status: { in: ["SUBMITTED", "APPROVED", "RECEIVED"] } } }),
    prisma.salesOrder.findMany({
      where: { tenantId },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    }),
    prisma.salesOrderItem.groupBy({
      by: ["productId"],
      where: { salesOrder: { tenantId } } as any,
      _sum: { subtotal: true, quantity: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: 5,
    }),
    prisma.salesOrder.groupBy({
      by: ["customerId"],
      _sum: { total: true },
      where: { tenantId, status: { not: "CANCELLED" } },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
  ]);

  const lowStockList = lowStock
    .map((p: any) => ({
      ...p,
      total: p.stocks.reduce((s: number, x: any) => s + Number(x.quantity), 0),
    }))
    .filter((p: any) => p.total < Number(p.safetyStock))
    .slice(0, 8);

  const productMap = topProducts.length
    ? await prisma.product.findMany({ where: { id: { in: topProducts.map((t: any) => t.productId) } } })
    : [];
  const customerMap = topCustomers.length
    ? await prisma.customer.findMany({ where: { id: { in: topCustomers.map((t: any) => t.customerId) } } })
    : [];

  // 近 14 天銷售
  const start14 = new Date();
  start14.setDate(start14.getDate() - 13);
  start14.setHours(0, 0, 0, 0);
  const dailySales = (await (prisma.$queryRawUnsafe as any)(
    `SELECT to_char("orderDate"::date, 'YYYY-MM-DD') as d, COALESCE(SUM(total),0) as total
     FROM "SalesOrder" WHERE "tenantId" = $1 AND "orderDate" >= $2 AND status <> 'CANCELLED'
     GROUP BY 1 ORDER BY 1`,
    tenantId, start14
  )) as { d: string; total: any }[];
  const dailyPurchase = (await (prisma.$queryRawUnsafe as any)(
    `SELECT to_char("orderDate"::date, 'YYYY-MM-DD') as d, COALESCE(SUM(total),0) as total
     FROM "PurchaseOrder" WHERE "tenantId" = $1 AND "orderDate" >= $2 AND status <> 'CANCELLED'
     GROUP BY 1 ORDER BY 1`,
    tenantId, start14
  )) as { d: string; total: any }[];

  const trendMap: Record<string, { date: string; sales: number; purchase: number }> = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(start14);
    d.setDate(start14.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    trendMap[k] = { date: k.slice(5), sales: 0, purchase: 0 };
  }
  dailySales.forEach((r: any) => {
    if (trendMap[r.d]) trendMap[r.d].sales = Number(r.total);
  });
  dailyPurchase.forEach((r: any) => {
    if (trendMap[r.d]) trendMap[r.d].purchase = Number(r.total);
  });

  return {
    todaySales: Number(todaySales._sum.total ?? 0),
    monthSales: Number(monthSales._sum.total ?? 0),
    monthPurchase: Number(monthPurchase._sum.total ?? 0),
    arTotal: Number(arOpen._sum.amount ?? 0) - Number(arOpen._sum.paidAmount ?? 0),
    apTotal: Number(apOpen._sum.amount ?? 0) - Number(apOpen._sum.paidAmount ?? 0),
    inventoryValue: Number(inventoryValue[0]?.total ?? 0),
    lowStockCount: lowStockList.length,
    lowStockList,
    unshipped,
    unpaidPO,
    recentSales,
    topProducts: topProducts.map((t: any) => ({
      name: productMap.find((p: any) => p.id === t.productId)?.name ?? "—",
      subtotal: Number(t._sum.subtotal ?? 0),
      qty: Number(t._sum.quantity ?? 0),
    })),
    topCustomers: topCustomers.map((t: any) => ({
      name: customerMap.find((c: any) => c.id === t.customerId)?.companyName ?? "—",
      total: Number(t._sum.total ?? 0),
    })),
    trend: Object.values(trendMap),
  };
}

function KPI({ icon: Icon, label, value, hint, accent }: any) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accent ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const tenantId = await requireTenantId();
  const s = await getStats(tenantId);
  return (
    <PageShell title="儀表板" description="營運總覽與即時數據">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Receipt} label="今日銷售額" value={formatMoney(s.todaySales)} accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
        <KPI icon={TrendingUp} label="本月銷售額" value={formatMoney(s.monthSales)} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        <KPI icon={ShoppingCart} label="本月採購額" value={formatMoney(s.monthPurchase)} accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
        <KPI icon={Package} label="庫存總成本" value={formatMoney(s.inventoryValue)} accent="bg-slate-100 text-slate-700 dark:bg-slate-800" />
        <KPI icon={Coins} label="應收帳款" value={formatMoney(s.arTotal)} hint="尚未收回" accent="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" />
        <KPI icon={Wallet} label="應付帳款" value={formatMoney(s.apTotal)} hint="尚未付清" accent="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" />
        <KPI icon={TrendingDown} label="未出貨訂單" value={formatNumber(s.unshipped)} accent="bg-indigo-100 text-indigo-700 dark:bg-indigo-950" />
        <KPI icon={AlertTriangle} label="低庫存商品" value={formatNumber(s.lowStockCount)} accent="bg-orange-100 text-orange-700 dark:bg-orange-950" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>近 14 日銷售 / 採購趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={s.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>商品銷售排行</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.topProducts.length === 0 && <div className="text-sm text-muted-foreground">尚無資料</div>}
            {s.topProducts.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="truncate flex items-center gap-2">
                  <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center text-xs font-semibold">{i + 1}</span>
                  <span className="truncate">{p.name}</span>
                </div>
                <span className="font-medium">{formatMoney(p.subtotal)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>最近銷售單</CardTitle>
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
                {s.recentSales.map((o: any) => (
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
        <Card>
          <CardHeader>
            <CardTitle>低庫存警示</CardTitle>
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
                {s.lowStockList.map((p: any) => (
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
    </PageShell>
  );
}
