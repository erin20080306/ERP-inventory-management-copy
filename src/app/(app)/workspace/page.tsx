import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowUpRight, Building2, Calculator, ClipboardList, HeartPulse, Package, PackageCheck, ScanBarcode, Shield, ShoppingCart, Store, UtensilsCrossed } from "lucide-react";
import { getSession } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { getDashboardKpis } from "@/lib/dashboard";
import { getProductEdition, normalizeBusinessMode } from "@/lib/product-editions";
import { createFormatters } from "@/i18n/format";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { normalizeStoreSlug } from "@/lib/storefront-branding";
import { medicalSitePath, storefrontPath } from "@/lib/public-site-links";
import { isMedicalEnabledForRequest } from "@/lib/client-platform";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const TONE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600",
  orange: "bg-orange-500/10 text-orange-600",
  indigo: "bg-indigo-500/10 text-indigo-600",
  violet: "bg-violet-500/10 text-violet-600",
  amber: "bg-amber-500/10 text-amber-600",
  rose: "bg-rose-500/10 text-rose-600",
};

export default async function WorkspacePage() {
  const t = await getTranslations("workspace");
  const tEdition = await getTranslations("editions");
  const f = createFormatters(await getLocale());
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const mode = normalizeBusinessMode(session.user.businessMode);
  const edition = getProductEdition(mode);
  const permissions = session.user.permissions;
  const isPlatformAdmin = Boolean(session.user.isSuperAdmin);
  const medicalEnabled = isMedicalEnabledForRequest(await headers());
  if (!isPlatformAdmin) {
    if (mode === "ERP" && hasPermission(permissions, "dashboard.view")) redirect("/dashboard");
    if (mode === "POS_RETAIL" && hasPermission(permissions, "pos.view")) redirect("/pos");
    if (mode === "POS_RESTAURANT" && hasPermission(permissions, "restaurant.view")) redirect("/pos/restaurant");
    if (medicalEnabled && mode === "POS_MEDICAL" && (hasPermission(permissions, "medical.view") || hasPermission(permissions, "pos.view"))) redirect("/medical");
  }
  const storefrontCode = session.user.companyCode || session.user.tenantId;
  const [commerceStats, publicWebsiteSettings] = await Promise.all([
    mode === "ECOMMERCE" && session.user.tenantId
      ? getDashboardKpis(session.user.tenantId, { webOnly: true })
      : null,
    (mode === "ECOMMERCE" || (medicalEnabled && mode === "POS_MEDICAL")) && session.user.tenantId
      ? prisma.companySetting.findFirst({
          where: { tenantId: session.user.tenantId },
          select: { storeSlug: true },
        })
      : null,
  ]);
  const publicWebsiteKey = publicWebsiteSettings?.storeSlug || normalizeStoreSlug(storefrontCode);
  // 管理者預覽必須留在目前 ERP 網域，NextAuth Cookie 才不會因跨 Vercel
  // 網域而遺失；對外分享的完整網址仍由設定頁的 storefrontUrl 提供。
  const tenantStorefrontHref = storefrontPath(publicWebsiteKey);
  const tenantMedicalSiteHref = medicalSitePath(publicWebsiteKey);
  const cards = [
    ...((mode === "ECOMMERCE" || isPlatformAdmin)
      ? [{ title: t(mode === "ECOMMERCE" ? "cardStorefrontMine" : "cardStorefrontInternal"), description: t("cardStorefrontDesc"), href: tenantStorefrontHref, icon: Store, tone: "rose" }]
      : []),
    ...((mode === "ECOMMERCE" || isPlatformAdmin) && hasPermission(permissions, "dashboard.view")
      ? [{ title: t("cardErp"), description: t("cardErpDesc"), href: "/dashboard", icon: Building2, tone: "indigo" }]
      : []),
    ...((mode === "POS_RETAIL" || isPlatformAdmin) && hasPermission(permissions, "pos.view")
      ? [{ title: t("cardRetail"), description: t("cardRetailDesc"), href: "/pos", icon: ScanBarcode, tone: "emerald" }]
      : []),
    ...((mode === "POS_RESTAURANT" || isPlatformAdmin) && hasPermission(permissions, "restaurant.view")
      ? [{ title: t("cardRestaurant"), description: t("cardRestaurantDesc"), href: "/pos/restaurant", icon: UtensilsCrossed, tone: "orange" }]
      : []),
    ...(medicalEnabled && (mode === "POS_MEDICAL" || isPlatformAdmin)
      ? [{ title: t(mode === "POS_MEDICAL" ? "cardMedicalSiteMine" : "cardMedicalSiteInternal"), description: t("cardMedicalSiteDesc"), href: tenantMedicalSiteHref, icon: Store, tone: "rose" }]
      : []),
    ...(medicalEnabled && (mode === "POS_MEDICAL" || isPlatformAdmin) && (hasPermission(permissions, "medical.view") || hasPermission(permissions, "pos.view"))
      ? [{ title: t("cardMedical"), description: t("cardMedicalDesc"), href: "/medical", icon: HeartPulse, tone: "rose" }]
      : []),
    ...(hasPermission(permissions, "inventory.view")
      ? [{ title: t("cardInventory"), description: t("cardInventoryDesc"), href: "/inventory", icon: Package, tone: "indigo" }]
      : []),
    ...(hasPermission(permissions, "accounting.view") || hasPermission(permissions, "journals.view")
      ? [{ title: t("cardAccounting"), description: t("cardAccountingDesc"), href: "/accounting/journals", icon: Calculator, tone: "violet" }]
      : []),
    ...(isPlatformAdmin
      ? [{ title: t("cardAdmin"), description: t("cardAdminDesc"), href: "/admin", icon: Shield, tone: "amber" }]
      : []),
  ];
  const workspaceTitle = isPlatformAdmin
    ? medicalEnabled
      ? t("adminFull")
      : t("adminNoMedical")
    : !medicalEnabled && mode === "POS_MEDICAL"
      ? t("iosMobile")
      : tEdition(`${edition.mode}.label`);
  const workspaceDescription = !medicalEnabled && mode === "POS_MEDICAL"
    ? t("iosMobileDesc")
    : isPlatformAdmin
      ? t("internalAccountDesc")
      : tEdition(`${edition.mode}.description`);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-3xl border bg-gradient-to-br from-slate-950 to-slate-900 p-7 text-white shadow-xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs">
              <Building2 className="h-3.5 w-3.5" />{isPlatformAdmin ? t("internalAccount") : t("lockedMode")}
            </div>
            <h1 className="text-2xl font-black md:text-3xl">{workspaceTitle}</h1>
            <p className="mt-2 text-sm text-slate-300">{workspaceDescription}</p>
          </div>
          <div className="max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-slate-300">
            {t("permissionNote")}
          </div>
        </div>
      </section>

      {mode === "ECOMMERCE" && (
        <section className="overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-rose-100 p-6 md:flex-row md:items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[.2em] text-rose-600">{t("commerceEyebrow")}</div>
              <h2 className="mt-2 text-xl font-black text-slate-900">{t("commerceHeading")}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={tenantStorefrontHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">{t("openStorefront")} <ArrowUpRight className="h-4 w-4" /></Link>
              <Link href="/fulfillment" className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700 hover:bg-rose-50">{t("erpFulfillment")} <ClipboardList className="h-4 w-4" /></Link>
            </div>
          </div>
          {commerceStats && <div className="grid gap-px border-b border-rose-100 bg-rose-100 sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-white/95 p-5"><div className="text-xs font-bold text-slate-500">{t("webRevenueToday")}</div><div className="mt-2 text-2xl font-black text-slate-950">{f.money(commerceStats.todaySales)}</div><div className="mt-1 text-[11px] text-slate-500">{t("webRevenueHint")}</div></div>
            <div className="bg-white/95 p-5"><div className="text-xs font-bold text-slate-500">{t("webOrdersToday")}</div><div className="mt-2 text-2xl font-black text-slate-950">{f.number(commerceStats.todayOrders)}</div><div className="mt-1 text-[11px] text-slate-500">{t("webOrdersHint")}</div></div>
            <div className="bg-white/95 p-5"><div className="text-xs font-bold text-slate-500">{t("webUnitsToday")}</div><div className="mt-2 text-2xl font-black text-slate-950">{f.number(commerceStats.todayQuantity)}</div><div className="mt-1 text-[11px] text-slate-500">{t("webUnitsHint")}</div></div>
            <div className="bg-white/95 p-5"><div className="text-xs font-bold text-slate-500">{t("openingFloat")}</div><div className="mt-2 text-xl font-black text-slate-950">{t("notApplicable")}</div><div className="mt-1 text-[11px] text-slate-500">{t("openingFloatHint")}</div></div>
          </div>}
          <div className="grid gap-px bg-rose-100 md:grid-cols-3">
            <div className="bg-white/90 p-5"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShoppingCart className="h-4 w-4 text-rose-600" />{t("step1Title")}</div><p className="mt-2 text-xs leading-5 text-slate-600">{t("step1Body")}</p></div>
            <div className="bg-white/90 p-5"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ClipboardList className="h-4 w-4 text-indigo-600" />{t("step2Title")}</div><p className="mt-2 text-xs leading-5 text-slate-600">{t("step2Body")}</p></div>
            <div className="bg-white/90 p-5"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><PackageCheck className="h-4 w-4 text-emerald-600" />{t("step3Title")}</div><p className="mt-2 text-xs leading-5 text-slate-600">{t("step3Body")}</p></div>
          </div>
        </section>
      )}
      <section>
        <h2 className="text-lg font-bold">{t("chooseWorkspace")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("chooseWorkspaceHint")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.href} href={card.href} className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${TONE_CLASSES[card.tone]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4 font-bold">{card.title}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.description}</p>
                <div className="mt-4 text-sm font-semibold text-primary">{t("enterWorkspace")}</div>
              </Link>
            );
          })}
        </div>
        {cards.length === 0 && <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("noWorkspace")}</div>}
      </section>
    </div>
  );
}
