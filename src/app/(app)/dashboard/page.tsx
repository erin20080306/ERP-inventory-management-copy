import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  ClipboardCheck,
  Clock3,
  Coins,
  Globe2,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getSession } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { getDashboardKpis, getDashboardWorkItems, type DashboardAccess } from "@/lib/dashboard";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/utils";
import { DashboardVisuals } from "./dashboard-visuals";

export const dynamic = "force-dynamic";

function KPI({ icon: Icon, label, value, hint, warning = false }: {
  icon: typeof Receipt;
  label: string;
  value: string;
  hint: string;
  warning?: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">{label}</div>
          <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
            <span className={`rounded px-2 py-1 font-bold ${warning ? "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>{warning ? "需處理" : "即時同步"}</span>
            {hint}
          </div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${warning ? "bg-orange-50 text-orange-600 dark:bg-orange-950/50" : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50"}`}><Icon className="h-5 w-5" /></div>
      </div>
    </article>
  );
}

function SummaryCard({ icon: Icon, label, value, hint, tone }: {
  icon: typeof Receipt;
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Icon className={`h-4 w-4 ${tone}`} />{label}</div>
      <div className="mt-2 text-lg font-black">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </article>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) {
    if (session?.user?.isSuperAdmin) redirect("/admin");
    redirect("/login");
  }
  const permissions = session.user.permissions;
  if (!hasPermission(permissions, "dashboard.view")) redirect("/workspace");

  const mode = normalizeBusinessMode(session.user.businessMode);
  const commerce = mode === "ECOMMERCE";
  const companyCode = session.user.companyCode || tenantId;
  const access: DashboardAccess = {
    sales: hasPermission(permissions, "sales.view"),
    salesApprove: hasPermission(permissions, "sales.approve"),
    purchases: hasPermission(permissions, "purchases.view"),
    purchasesApprove: hasPermission(permissions, "purchases.approve"),
    returns: hasPermission(permissions, "returns.view"),
    returnsApprove: hasPermission(permissions, "returns.approve"),
    pos: hasPermission(permissions, "pos.view"),
    posApprove: hasPermission(permissions, "pos.approve"),
    restaurant: hasPermission(permissions, "restaurant.view"),
    journals: hasPermission(permissions, "journals.view"),
    journalsApprove: hasPermission(permissions, "journals.approve"),
    cashApprove: hasPermission(permissions, "cash.approve"),
  };
  const canInventory = hasPermission(permissions, "inventory.view");
  const canCash = hasPermission(permissions, "cash.view");
  const canReceivables = hasPermission(permissions, "receivables.view");
  const canPayables = hasPermission(permissions, "payables.view");
  const [stats, work] = await Promise.all([
    getDashboardKpis(tenantId, { webOnly: commerce }),
    getDashboardWorkItems(tenantId, access, { webOnly: commerce }),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 lg:flex-row lg:items-end">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[.24em] text-indigo-600">{commerce ? "ECOMMERCE / WEB ORDERS" : "ERP / OPERATIONS"}</div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{commerce ? "商城與 ERP 連動中心" : "企業營運總覽"}</h1>
          <p className="mt-2 text-sm text-slate-500">{commerce ? "一般消費者官網下單後，自動進入目前租戶的訂單、庫存、出貨與帳務流程。" : "商品、採購、銷售、庫存、應收應付與會計資料維持原有作業邏輯。"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {commerce && <Link href={`/store/${encodeURIComponent(companyCode)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"><Globe2 className="h-4 w-4" />進入商店官網 <ArrowUpRight className="h-4 w-4" /></Link>}
          {access.sales && <Link href="/sales" className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-500"><ShoppingCart className="h-4 w-4" />{commerce ? "網路訂單" : "建立銷售訂單"}</Link>}
        </div>
      </header>

      {(access.sales || canInventory) && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {commerce && access.sales ? <>
            <KPI icon={Receipt} label="今日官網營業額" value={formatMoney(stats.todaySales)} hint="僅計算官網訂單，不含零用金" />
            <KPI icon={ShoppingCart} label="今日官網訂單" value={formatNumber(stats.todayOrders)} hint="以台北營業日統計" />
            <KPI icon={Package} label="今日售出件數" value={formatNumber(stats.todayQuantity)} hint="今日官網訂單商品總數" />
            <KPI icon={AlertTriangle} label="待處理網路訂單" value={formatNumber(stats.unshipped)} hint="核准後進入出貨" warning={stats.unshipped > 0} />
          </> : <>
            {access.sales && <KPI icon={Receipt} label="今日營業額" value={formatMoney(stats.todaySales)} hint="較昨日持續更新" />}
            {access.sales && <KPI icon={TrendingUp} label="本月銷售額" value={formatMoney(stats.monthSales)} hint="銷售與 POS 合併" />}
            {access.sales && <KPI icon={ShoppingCart} label="未出貨訂單" value={formatNumber(stats.unshipped)} hint="核准後進入出貨" warning={stats.unshipped > 0} />}
            {canInventory && <KPI icon={AlertTriangle} label="低庫存商品" value={formatNumber(stats.lowStockCount)} hint="低於安全庫存" warning={stats.lowStockCount > 0} />}
          </>}
        </section>
      )}

      {(canInventory || canCash || canReceivables || canPayables || access.purchases) && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {canInventory && <SummaryCard icon={Package} label="庫存總成本" value={formatMoney(stats.inventoryValue)} tone="text-indigo-500" />}
          {canCash && <SummaryCard icon={Banknote} label="庫存現金" value={formatMoney(stats.inventoryCash)} hint="已過帳總帳餘額" tone="text-emerald-600" />}
          {canReceivables && <SummaryCard icon={Coins} label="應收帳款" value={formatMoney(stats.arTotal)} tone="text-emerald-500" />}
          {canPayables && <SummaryCard icon={Wallet} label="應付帳款" value={formatMoney(stats.apTotal)} tone="text-rose-500" />}
          {access.purchases && <SummaryCard icon={ShoppingCart} label="本月採購額" value={formatMoney(stats.monthPurchase)} tone="text-amber-500" />}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b bg-slate-50/70 p-5 dark:bg-slate-900/50 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 font-black"><ClipboardCheck className="h-5 w-5 text-indigo-600" />未完成與待核准</h2>
            <p className="mt-1 text-xs text-muted-foreground">只彙整目前帳號有權查看的模組；具核准權限時，待核准項目會自動置頂。</p>
          </div>
          <div className="flex gap-2 text-xs font-bold">
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">待核准 {work.approvalCount}</span>
            <span className="rounded-full bg-slate-200 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">未完成 {work.unfinishedCount}</span>
          </div>
        </div>
        <div className="divide-y">
          {work.items.map((item) => (
            <Link key={item.id} href={item.href} className="group flex flex-col gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-black ${item.kind === "APPROVAL" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"}`}>{item.kind === "APPROVAL" ? "待核准" : "未完成"}</span>
                  <span className="text-xs font-bold text-muted-foreground">{item.module}</span>
                  <span className="truncate text-sm font-bold">{item.title}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(item.updatedAt)}</span>
                <span className="font-bold text-indigo-600 group-hover:underline">前往處理 →</span>
              </div>
            </Link>
          ))}
          {work.items.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">依目前權限，沒有未完成或待核准項目。</div>}
        </div>
      </section>

      <DashboardVisuals showSales={access.sales} showPurchases={access.purchases} showInventory={canInventory} />
    </div>
  );
}