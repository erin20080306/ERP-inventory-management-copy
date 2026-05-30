import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, formatNumber } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { TrendingUp, TrendingDown, Package, AlertTriangle, ShoppingCart, Receipt, Coins, Wallet } from "lucide-react";
import { getSession } from "@/lib/api";
import { redirect } from "next/navigation";
import { DashboardVisuals } from "./dashboard-visuals";
import { getDashboardKpis } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

function KPI({ icon: Icon, label, value, hint, accent, textColor }: any) {
  return (
    <Card className={`${accent ?? "bg-white dark:bg-slate-800"} border-0 shadow-md overflow-hidden`}>
      <CardContent className="p-0">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white/90 uppercase tracking-wider">{label}</div>
              <div className={`mt-2 text-3xl font-extrabold tracking-tight ${textColor ?? "text-slate-900 dark:text-white"}`}>{value}</div>
              {hint && <div className="text-xs text-white/75 font-medium mt-1">{hint}</div>}
            </div>
            <div className="h-12 w-12 rounded-xl bg-white/20 dark:bg-white/10 flex items-center justify-center">
              <Icon className="h-6 w-6 text-white/90" />
            </div>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-white/20 to-transparent" />
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    if (session?.user?.isSuperAdmin) redirect("/admin");
    redirect("/login");
  }
  // 即使是 superadmin，只要有 tenantId 就允許進入前台
  const s = await getDashboardKpis(tenantId);
  return (
    <PageShell title="儀表板" description="營運總覽與即時數據">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Receipt} label="今日銷售額" value={formatMoney(s.todaySales)} accent="bg-gradient-to-br from-blue-500 to-blue-600" textColor="text-white" />
        <KPI icon={TrendingUp} label="本月銷售額" value={formatMoney(s.monthSales)} accent="bg-gradient-to-br from-emerald-500 to-emerald-600" textColor="text-white" />
        <KPI icon={ShoppingCart} label="本月採購額" value={formatMoney(s.monthPurchase)} accent="bg-gradient-to-br from-red-500 to-red-600" textColor="text-white" />
        <KPI icon={Package} label="庫存總成本" value={formatMoney(s.inventoryValue)} accent="bg-gradient-to-br from-amber-500 to-amber-600" textColor="text-white" />
        <KPI icon={Coins} label="應收帳款" value={formatMoney(s.arTotal)} hint="尚未收回" accent="bg-gradient-to-br from-green-500 to-green-600" textColor="text-white" />
        <KPI icon={Wallet} label="應付帳款" value={formatMoney(s.apTotal)} hint="尚未付清" accent="bg-gradient-to-br from-rose-500 to-rose-600" textColor="text-white" />
        <KPI icon={TrendingDown} label="未出貨訂單" value={formatNumber(s.unshipped)} accent="bg-gradient-to-br from-indigo-500 to-indigo-600" textColor="text-white" />
        <KPI icon={AlertTriangle} label="低庫存商品" value={formatNumber(s.lowStockCount)} accent="bg-gradient-to-br from-orange-500 to-orange-600" textColor="text-white" />
      </div>

      <DashboardVisuals />
    </PageShell>
  );
}
