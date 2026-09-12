import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Building2, Calculator, Check, Download, HeartPulse, MonitorSmartphone, ScanLine, ShieldCheck, ShoppingBag, ShoppingCart, Store, UtensilsCrossed, Workflow } from "lucide-react";
import { isMedicalEnabledForRequest } from "@/lib/client-platform";
import { LocaleSwitcher } from "@/components/locale-switcher";

// 文字一律走 solutions 命名空間；此處只保留與語言無關的結構（模式代碼、圖示、配色、次要連結鍵）。
const SOLUTIONS = [
  { mode: "ERP", key: "Erp", icon: Building2, accent: "from-indigo-500 to-sky-500" },
  { mode: "ECOMMERCE", key: "Ecom", icon: ShoppingBag, accent: "from-amber-400 to-rose-500",
    secondaryLinks: [{ href: "/store/atelier-noir", labelKey: "secStoreTrial" }, { href: "/login", labelKey: "secMerchantLogin" }] },
  { mode: "POS_RETAIL", key: "Retail", icon: Store, accent: "from-emerald-500 to-teal-500" },
  { mode: "POS_RESTAURANT", key: "Rest", icon: UtensilsCrossed, accent: "from-orange-500 to-rose-500" },
  { mode: "POS_MEDICAL", key: "Med", icon: HeartPulse, accent: "from-fuchsia-500 to-rose-400",
    secondaryLinks: [{ href: "/medical/atelier-clinic", labelKey: "secMedicalTrial" }, { href: "/login", labelKey: "secClinicLogin" }] },
] as const;

const HIGHLIGHTS = [
  { key: "hlFinance", icon: Calculator, iconClass: "border-indigo-300/20 bg-indigo-400/10 text-indigo-200" },
  { key: "hlEcom", icon: ShoppingCart, iconClass: "border-amber-300/20 bg-amber-400/10 text-amber-200" },
  { key: "hlWorkflow", icon: Workflow, iconClass: "border-sky-300/20 bg-sky-400/10 text-sky-200" },
  { key: "hlRestaurant", icon: UtensilsCrossed, iconClass: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" },
] as const;

export default async function SolutionsPage() {
  const t = await getTranslations("solutions");
  const medicalEnabled = isMedicalEnabledForRequest(await headers());
  const visibleSolutions = medicalEnabled ? SOLUTIONS : SOLUTIONS.filter((s) => s.mode !== "POS_MEDICAL");
  const dataSovPoints = ["dataSovP1", "dataSovP2", "dataSovP3", "dataSovP4"] as const;
  return (
    <main className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/70 via-slate-950 to-emerald-950/60" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-5 py-10 md:py-16">
        <header className="flex items-center justify-between gap-4 mb-14">
          <Link href="/" className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <MonitorSmartphone className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-bold">{t("brand")}</span>
              <span className="block text-xs text-slate-400">{t("brandTagline")}</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/store/atelier-noir" className="hidden text-amber-200 hover:text-white transition md:inline">{t("navStoreTrial")}</Link>
            <Link href="/plans" className="text-slate-300 hover:text-white transition">{t("navPlans")}</Link>
            <Link href="/terms" className="hidden text-slate-300 hover:text-white transition sm:inline">{t("navTerms")}</Link>
            <Link href="/login" className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition">{t("navLogin")}</Link>
            <LocaleSwitcher />
          </div>
        </header>

        <section className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-full px-3 py-1.5 mb-5">
            <ScanLine className="h-3.5 w-3.5" />{t("heroBadge")}
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">{t("heroTitle")}</h1>
          <p className="text-slate-400 mt-4 leading-7">{medicalEnabled ? t("heroLeadMedical") : t("heroLeadNoMedical")}{t("heroLeadTail")}</p>
        </section>

        <section className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl md:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative">
            <div className="mb-5 max-w-3xl">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">{t("expertiseEyebrow")}</div>
              <h2 className="text-2xl font-black tracking-tight md:text-3xl">{t("expertiseTitle")}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">{t("expertiseDesc")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {HIGHLIGHTS.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.key} className="group rounded-2xl border border-white/10 bg-slate-950/45 p-4 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-slate-950/60">
                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl border ${item.iconClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-bold text-slate-100">{t(`${item.key}Title`)}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{t(`${item.key}Desc`)}</p>
                  </article>
                );
              })}
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-300/20 bg-gradient-to-r from-emerald-400/10 via-slate-950/75 to-indigo-400/10 p-5 md:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex max-w-2xl items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t("dataSovEyebrow")}</div>
                    <h3 className="mt-2 text-xl font-black text-white">{t("dataSovTitle")}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{t("dataSovDesc")}</p>
                  </div>
                </div>
                <ul className="grid shrink-0 gap-2 text-xs text-slate-200 sm:grid-cols-2 lg:w-[390px]">
                  {dataSovPoints.map((point) => (
                    <li key={point} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2.5">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                      <span>{t(point)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 text-sm md:grid-cols-3">
          <div><div className="font-semibold text-sky-200">{t("trialOnlyTitle")}</div><p className="mt-1 text-xs leading-5 text-slate-400">{t("trialOnlyDesc")}</p></div>
          <div><div className="flex items-center gap-2 font-semibold text-sky-200"><Download className="h-4 w-4" />{t("downloadTitle")}</div><p className="mt-1 text-xs leading-5 text-slate-400">{t("downloadDesc")}</p></div>
          <div><div className="font-semibold text-sky-200">{t("seatsTitle")}</div><p className="mt-1 text-xs leading-5 text-slate-400">{t("seatsDesc")}</p></div>
        </section>

        <div className="mb-3 flex items-center justify-between gap-4 text-xs text-slate-400">
          <span>{medicalEnabled ? t("sameFlowMedical") : t("sameFlowNoMedical")}</span>
          <span className="shrink-0 text-sky-200">{t("swipeHint")}</span>
        </div>
        <section className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:thin]" aria-label={medicalEnabled ? t("editionsAriaMedical") : t("editionsAriaNoMedical")}>
          {visibleSolutions.map((solution) => {
            const Icon = solution.icon;
            const eyebrow = t(`mode${solution.key}Eyebrow`);
            return (
              <article key={solution.mode} className="flex min-w-[min(86vw,360px)] snap-start flex-col rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl md:min-w-[340px] md:p-8">
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${solution.accent} flex items-center justify-center shadow-lg mb-6`}>
                  <Icon className="h-7 w-7" />
                </div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p>
                <h2 className="text-2xl font-bold mt-2">{t(`mode${solution.key}Title`)}</h2>
                <p className="text-sm text-slate-400 leading-6 mt-3 min-h-12">{t(`mode${solution.key}Desc`)}</p>
                <ul className="my-7 flex-1 space-y-3 text-sm text-slate-200">
                  {(["P1", "P2", "P3"] as const).map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span>{t(`mode${solution.key}${p}`)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/register?mode=${solution.mode}`}
                  className={`w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r ${solution.accent} text-white font-bold shadow-lg hover:brightness-110 transition`}
                >
                  {t("chooseMode", { eyebrow })} <ArrowRight className="h-4 w-4" />
                </Link>
                {"secondaryLinks" in solution && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    {solution.secondaryLinks.map((link) => <Link key={link.href} href={link.href} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-slate-300 transition hover:bg-white/10 hover:text-white">{t(link.labelKey)}</Link>)}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span>{t("footerTrial")}</span>
          <span>{t("footerManual")}</span>
          <Link href="/privacy" className="hover:text-slate-300">{t("privacy")}</Link>
          <Link href="/terms" className="hover:text-slate-300">{t("terms")}</Link>
          <Link href="/refund" className="hover:text-slate-300">{t("refund")}</Link>
        </footer>
      </div>
    </main>
  );
}
