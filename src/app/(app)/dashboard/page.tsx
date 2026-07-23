import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Coins,
  Globe2,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getSession } from "@/lib/api";
import { getDashboardKpis } from "@/lib/dashboard";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { formatMoney, formatNumber } from "@/lib/utils";
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

export default async function DashboardPage() {
  const session = await getSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) {
    if (session?.user?.isSuperAdmin) redirect("/admin");
    redirect("/login");
  }
  const mode = normalizeBusinessMode(session.user.businessMode);
  const commerce = mode === "ECOMMERCE";
  const companyCode = session.user.companyCode || tenantId;
  const s = await getDashboardKpis(tenantId);

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
          <Link href="/sales" className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-500"><ShoppingCart className="h-4 w-4" />{commerce ? "網路訂單" : "建立銷售訂單"}</Link>
        </div>
      </header>

      {commerce && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100 md:flex-row md:items-center">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <strong>商城已綁定公司代碼 {companyCode}</strong>
          <span className="text-xs text-emerald-700 dark:text-emerald-300">管理者按鈕會另開官網；一般消費者不會看到 ERP 返回列。</span>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPI icon={Receipt} label="今日營業額" value={formatMoney(s.todaySales)} hint="較昨日持續更新" />
        <KPI icon={TrendingUp} label="本月銷售額" value={formatMoney(s.monthSales)} hint="銷售與 POS 合併" />
        <KPI icon={ShoppingCart} label={commerce ? "待處理網路訂單" : "未出貨訂單"} value={formatNumber(s.unshipped)} hint="核准後進入出貨" warning={s.unshipped > 0} />
        <KPI icon={AlertTriangle} label="低庫存商品" value={formatNumber(s.lowStockCount)} hint="低於安全庫存" warning={s.lowStockCount > 0} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Package className="h-4 w-4 text-indigo-500" />庫存總成本</div><div className="mt-2 text-lg font-black">{formatMoney(s.inventoryValue)}</div></article>
        <article className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Coins className="h-4 w-4 text-emerald-500" />應收帳款</div><div className="mt-2 text-lg font-black">{formatMoney(s.arTotal)}</div></article>
        <article className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Wallet className="h-4 w-4 text-rose-500" />應付帳款</div><div className="mt-2 text-lg font-black">{formatMoney(s.apTotal)}</div></article>
        <article className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><ShoppingCart className="h-4 w-4 text-amber-500" />本月採購額</div><div className="mt-2 text-lg font-black">{formatMoney(s.monthPurchase)}</div></article>
      </section>

      <DashboardVisuals />
    </div>
  );
}