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
import { hasPermission } from "@/lib/permissions";
import { getDashboardKpis, getDashboardWorkItems, type DashboardAccess } from "@/lib/dashboard";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { getLocale, getTranslations } from "next-intl/server";
import { createFormatters } from "@/i18n/format";
import { prisma } from "@/lib/prisma";
import { normalizeStoreSlug } from "@/lib/storefront-branding";
import { storefrontPath } from "@/lib/public-site-links";
import { DashboardVisuals } from "./dashboard-visuals";

export const dynamic = "force-dynamic";

function KPI({ icon: Icon, label, value, hint, warning = false, warningLabel, normalLabel }: {
  icon: typeof Receipt;
  label: string;
  value: string;
  hint: string;
  warning?: boolean;
  warningLabel: string;
  normalLabel: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">{label}</div>
          <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
            <span className={`rounded px-2 py-1 font-bold ${warning ? "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>{warning ? warningLabel : normalLabel}</span>
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
  const [stats, work, companySettings, locale, t] = await Promise.all([
    getDashboardKpis(tenantId, { webOnly: commerce }),
    getDashboardWorkItems(tenantId, access, { webOnly: commerce }),
    // 幣別是帳務事實，取自租戶設定；顯示格式才跟著介面語言。
    prisma.companySetting.findFirst({ where: { tenantId }, select: { storeSlug: true, currency: true } }),
    getLocale(),
    getTranslations("dashboard"),
  ]);
  const storefrontHref = storefrontPath(companySettings?.storeSlug || normalizeStoreSlug(companyCode));
  const f = createFormatters(locale, companySettings?.currency || "TWD");
  const badge = { warningLabel: t("needsAction"), normalLabel: t("realtimeSync") };

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 lg:flex-row lg:items-end">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[.24em] text-indigo-600">{commerce ? "ECOMMERCE / WEB ORDERS" : "ERP / OPERATIONS"}</div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{commerce ? t("commerceTitle") : t("title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{commerce ? t("commerceSubtitle") : t("erpSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {commerce && <Link href={storefrontHref} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"><Globe2 className="h-4 w-4" />{t("openStorefront")} <ArrowUpRight className="h-4 w-4" /></Link>}
          {access.sales && <Link href={commerce ? "/fulfillment" : "/sales"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-500"><ShoppingCart className="h-4 w-4" />{commerce ? t("fulfillment") : t("createSalesOrder")}</Link>}
        </div>
      </header>

      {(access.sales || canInventory) && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {commerce && access.sales ? <>
            <KPI icon={Receipt} label={t("todayWebRevenue")} value={f.money(stats.todaySales)} hint={t("todayWebRevenueHint")} {...badge} />
            <KPI icon={ShoppingCart} label={t("todayWebOrders")} value={f.number(stats.todayOrders)} hint={t("byTaipeiBusinessDay")} {...badge} />
            <KPI icon={Package} label={t("todayUnitsSold")} value={f.number(stats.todayQuantity)} hint={t("todayWebUnitsHint")} {...badge} />
            <KPI icon={AlertTriangle} label={t("pendingWebOrders")} value={f.number(stats.unshipped)} hint={t("afterApprovalShip")} warning={stats.unshipped > 0} {...badge} />
          </> : <>
            {access.sales && <KPI icon={Receipt} label={t("todayRevenue")} value={f.money(stats.todaySales)} hint={t("updatingVsYesterday")} {...badge} />}
            {access.sales && <KPI icon={TrendingUp} label={t("monthSales")} value={f.money(stats.monthSales)} hint={t("salesWithPos")} {...badge} />}
            {access.sales && <KPI icon={ShoppingCart} label={t("unshippedOrders")} value={f.number(stats.unshipped)} hint={t("afterApprovalShip")} warning={stats.unshipped > 0} {...badge} />}
            {canInventory && <KPI icon={AlertTriangle} label={t("lowStock")} value={f.number(stats.lowStockCount)} hint={t("lowStockHint")} warning={stats.lowStockCount > 0} {...badge} />}
          </>}
        </section>
      )}

      {(canInventory || canCash || canReceivables || canPayables || access.purchases) && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {canInventory && <SummaryCard icon={Package} label={t("inventoryValue")} value={f.money(stats.inventoryValue)} tone="text-indigo-500" />}
          {canCash && <SummaryCard icon={Banknote} label={t("cashOnHand")} value={f.money(stats.inventoryCash)} hint={t("postedLedgerBalance")} tone="text-emerald-600" />}
          {canReceivables && <SummaryCard icon={Coins} label={t("receivables")} value={f.money(stats.arTotal)} tone="text-emerald-500" />}
          {canPayables && <SummaryCard icon={Wallet} label={t("payables")} value={f.money(stats.apTotal)} tone="text-rose-500" />}
          {access.purchases && <SummaryCard icon={ShoppingCart} label={t("monthPurchases")} value={f.money(stats.monthPurchase)} tone="text-amber-500" />}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b bg-slate-50/70 p-5 dark:bg-slate-900/50 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 font-black"><ClipboardCheck className="h-5 w-5 text-indigo-600" />{t("workQueueTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("workQueueHint")}</p>
          </div>
          <div className="flex gap-2 text-xs font-bold">
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">{t("pendingApprovalCount", { count: work.approvalCount })}</span>
            <span className="rounded-full bg-slate-200 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{t("unfinishedCount", { count: work.unfinishedCount })}</span>
          </div>
        </div>
        <div className="divide-y">
          {work.items.map((item) => (
            <Link key={item.id} href={item.href} className="group flex flex-col gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-black ${item.kind === "APPROVAL" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"}`}>{item.kind === "APPROVAL" ? t("pendingApproval") : t("incomplete")}</span>
                  <span className="text-xs font-bold text-muted-foreground">{item.module}</span>
                  <span className="truncate text-sm font-bold">{item.title}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{f.dateTime(item.updatedAt)}</span>
                <span className="font-bold text-indigo-600 group-hover:underline">{t("goHandle")}</span>
              </div>
            </Link>
          ))}
          {work.items.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">{t("workQueueEmpty")}</div>}
        </div>
      </section>

      <DashboardVisuals showSales={access.sales} showPurchases={access.purchases} showInventory={canInventory} />
    </div>
  );
}
