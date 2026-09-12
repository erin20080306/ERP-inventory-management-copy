"use client";
import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Lock, User, Building2, ShieldCheck, BarChart3, Package, Sparkles, Download, Globe2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function LoginClient({ iosApp = false }: { iosApp?: boolean }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner iosApp={iosApp} />
    </Suspense>
  );
}

function normalizeCallbackUrl(value: string | null) {
  const fallback = "/workspace";
  if (!value) return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (typeof window === "undefined") return fallback;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin || url.hostname === window.location.hostname) {
      return `${url.pathname}${url.search}${url.hash}` || fallback;
    }
  } catch {}
  return fallback;
}

function LoginInner({ iosApp }: { iosApp: boolean }) {
  const t = useTranslations("login");
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = normalizeCallbackUrl(sp.get("callbackUrl"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<"loading" | "local" | "online">("loading");
  const [showDemoPreview, setShowDemoPreview] = useState(false);
  const [localProfile, setLocalProfile] = useState<{ companyName: string; businessMode: string; username: string; email: string; managerName: string } | null>(null);
  const [localProfileError, setLocalProfileError] = useState("");
  const isLocalCompanyHost = runtimeMode === "local";
  const isOnlineRuntime = runtimeMode === "online";
  const registered = sp.get("registered") === "1";

  function navigateAfterLogin(path: string) {
    if (iosApp) {
      router.replace(path);
      router.refresh();
      return;
    }
    window.location.href = path;
  }

  useEffect(() => {
    const localHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
    fetch("/api/runtime-mode", { cache: "no-store" })
      .then((response) => response.json())
      .then((runtime) => {
        const localMode = runtime.localLicenseMode === true;
        setRuntimeMode(localMode ? "local" : "online");
        setShowDemoPreview(localHost && runtime.demoLoginEnabled === true);
        if (localMode) {
          void fetch("/api/local-login-profile", { cache: "no-store" })
            .then(async (response) => {
              const profile = await response.json();
              if (!response.ok) throw new Error(profile.error || t("profileNotReady"));
              setLocalProfile(profile);
              setUsername(profile.username);
              setLocalProfileError("");
            })
            .catch((profileError) => setLocalProfileError(profileError instanceof Error ? profileError.message : t("profileLoadFailed")));
        }
      })
      .catch(() => {
        // 正式工作站無法判定模式時採安全預設，不顯示任何模擬帳號或密碼。
        setRuntimeMode("loading");
        setShowDemoPreview(false);
      });
    const registeredUsername = sp.get("username")?.trim();
    if (registeredUsername) setUsername(registeredUsername);
  }, [sp]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await Promise.race([
        signIn("credentials", { username, password, redirect: false, callbackUrl }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error(t("timeout"))), 20_000)),
      ]);
      if (res?.error) {
        toast.error(res.error === "CredentialsSignin" ? t("invalidCredentials") : res.error);
        return;
      }
      toast.success(t("signInSuccess"));
      // 標記首次登入，讓手機版選單自動展開
      try { sessionStorage.setItem("erp_just_logged_in", "1"); } catch {}
      // 登入後依平台管理者／公司模式進入正確工作區。
      const sess = await fetch("/api/auth/session").then((r) => r.json());
      if (sess?.user?.isSuperAdmin) {
        navigateAfterLogin("/admin");
        return;
      }
      if (!sp.get("callbackUrl")) {
        navigateAfterLogin("/workspace");
        return;
      }
      navigateAfterLogin(callbackUrl);
    } catch (error: any) {
      toast.error(error?.message || t("signInFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (isLocalCompanyHost) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-950 to-emerald-950" />
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
        <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500"><Building2 className="h-6 w-6" /></div>
            <div><p className="text-xs uppercase tracking-[.2em] text-emerald-300">ERIN LOCAL APP</p><h1 className="mt-1 text-xl font-black">{localProfile?.companyName || t("localCompanySyncing")}</h1></div>
          </div>

          {localProfile ? (
            <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
              <p className="text-xs text-emerald-200">{t("localTenantConnected")}</p>
              <div className="mt-2 font-semibold">{localProfile.managerName}</div>
              <div className="mt-1 text-xs text-slate-400">{localProfile.email}・{localProfile.businessMode}</div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">{localProfileError || t("localProfileLoading")}</div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <input type="hidden" value={username} autoComplete="username" readOnly />
            <div className="space-y-1.5">
              <Label htmlFor="local-password" className="text-xs text-slate-300">{t("localPasswordLabel")}</Label>
              <div className="relative"><Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><Input id="local-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder={t("localPasswordPlaceholder")} className="h-12 border-white/10 bg-white/5 pl-9 text-white placeholder:text-slate-500" required autoFocus /></div>
            </div>
            <Button type="submit" disabled={loading || !localProfile || !username} className="h-12 w-full border-0 bg-gradient-to-r from-indigo-500 to-emerald-500 font-bold text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{loading ? t("localSigningIn") : t("localEnter")}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">{t("localFootnote")}</p>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-950 flex items-center justify-center p-4">
      {/* 動態背景：漸層 + 光暈 */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-950 to-emerald-950" />
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-500/30 rounded-full blur-3xl animate-pulse" />
      <div
        className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: "1s" }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-purple-500/10 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: "2s" }}
      />
      {/* 網格背景 */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center">
        {/* 左側品牌與特色 */}
        <div className="text-white space-y-6 md:space-y-8 order-2 md:order-1">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
              <Building2 className="h-6 w-6 md:h-7 md:w-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-wide bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                {t("productTitle")}
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">Enterprise &amp; Point of Sale Management</p>
            </div>
          </div>

          <div className="space-y-3 md:space-y-4">
            <Feature icon={<Package className="h-4 w-4 md:h-5 md:w-5" />} title={t("featureInventoryTitle")} desc={t("featureInventoryDesc")} />
            <Feature icon={<BarChart3 className="h-4 w-4 md:h-5 md:w-5" />} title={t("featureAccountingTitle")} desc={t("featureAccountingDesc")} />
            <Feature icon={<ShieldCheck className="h-4 w-4 md:h-5 md:w-5" />} title={t("featureSecurityTitle")} desc={t("featureSecurityDesc")} />
            <Feature icon={<Sparkles className="h-4 w-4 md:h-5 md:w-5" />} title={t("featureDualModeTitle")} desc={t("featureDualModeDesc")} />
          </div>

          <div className="pt-3 md:pt-4 border-t border-white/10 text-xs text-slate-500 space-y-2 md:space-y-3">
            <div>
              © {new Date().getFullYear()} Professional ERP System · {t("footerTagline")}
            </div>
            <div className="space-y-1">
              <div className="font-medium text-slate-400">{t("servicedBy")}</div>
              <div className="text-slate-500">erin20080306@gmail.com</div>
              <div className="text-slate-500">Line ID: erin2008</div>
              <a
                href="https://erin.is-a.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 transition"
              >
                {t("website")}: https://erin.is-a.dev/
              </a>
            </div>
          </div>
        </div>

        {/* 右側登入卡 */}
        <div className="w-full max-w-md mx-auto md:ml-auto order-1 md:order-2">

          <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">{t("welcomeBack")}</h2>
                <p className="text-sm text-slate-400 mt-1">{t("subtitle")}</p>
              </div>
              {/* 登入前就能切換語言，外籍使用者不必先看懂中文才找得到開關。 */}
              <div className="shrink-0 text-white">
                <LocaleSwitcher />
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {registered && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">{t("registeredHint")}</div>}
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-slate-300 text-xs">
                  {t("usernameOrEmail")}
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="username"
                    className="pl-9 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder={t("usernamePlaceholder")}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-300 text-xs">
                  {t("password")}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    className="pl-9 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-indigo-500 to-emerald-500 hover:from-indigo-600 hover:to-emerald-600 border-0 text-white font-semibold tracking-wide shadow-lg shadow-indigo-500/30"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {loading ? t("signingIn") : t("signIn")}
              </Button>
            </form>

            {isLocalCompanyHost && (
              <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs leading-5 text-emerald-100">
                {t("hostLoginHint")}
              </div>
            )}

            {showDemoPreview && (
              <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
                <div className="mb-2 text-center text-[11px] font-semibold text-amber-200">{t("demoTitle")}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => { setUsername("demo-erp"); setPassword("DemoERP2026!"); }} className="rounded-lg border border-white/10 px-2 py-2 text-[11px] text-slate-300 hover:bg-white/10">{t("demoErp")}</button>
                  <button type="button" onClick={() => { setUsername("demo-retail"); setPassword("DemoRetail2026!"); }} className="rounded-lg border border-white/10 px-2 py-2 text-[11px] text-slate-300 hover:bg-white/10">{t("demoRetail")}</button>
                  <button type="button" onClick={() => { setUsername("demo-food"); setPassword("DemoFood2026!"); }} className="rounded-lg border border-white/10 px-2 py-2 text-[11px] text-slate-300 hover:bg-white/10">{t("demoFood")}</button>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => { setUsername("demo-trial"); setPassword("DemoTrial2026!"); }} className="rounded-lg border border-amber-300/20 px-2 py-2 text-[11px] text-amber-200 hover:bg-amber-300/10">{t("demoTrial")}</button>
                  <button type="button" onClick={() => { setUsername("demo-expired"); setPassword("DemoExpired2026!"); }} className="rounded-lg border border-rose-300/20 px-2 py-2 text-[11px] text-rose-200 hover:bg-rose-300/10">{t("demoExpired")}</button>
                  <button type="button" onClick={() => { setUsername("demo-revoked"); setPassword("DemoRevoked2026!"); }} className="rounded-lg border border-rose-300/20 px-2 py-2 text-[11px] text-rose-200 hover:bg-rose-300/10">{t("demoRevoked")}</button>
                </div>
              </div>
            )}

            {isOnlineRuntime && <div className="mt-4 text-center">
              <Link href="/solutions" className="text-sm text-slate-400 hover:text-white transition">
                {t("noAccount")}<span className="text-indigo-400 font-medium">{t("tryNow")}</span>
              </Link>
            </div>}

            {isOnlineRuntime && !iosApp && <div className="mt-4 rounded-xl border border-sky-300/20 bg-sky-300/5 p-3 text-xs leading-5 text-slate-400">
              <div className="flex items-start gap-2"><Download className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /><p><span className="font-semibold text-sky-200">{t("trialNoticeStrong")}</span>{t("trialNoticeRest")}</p></div>
              <div className="mt-2 flex flex-wrap gap-3 pl-6"><Link href="/plans" className="text-emerald-300 hover:underline">{t("plansLink")}</Link><Link href="/terms" className="text-indigo-300 hover:underline">{t("termsLink")}</Link><Link href="/refund" className="text-indigo-300 hover:underline">{t("refundLink")}</Link></div>
            </div>}

            {isOnlineRuntime && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs leading-5 text-slate-300">
              <div className="flex items-start gap-2">
                <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <div>
                  <div className="font-semibold text-emerald-200">{t("storefrontTitle")}</div>
                  <p className="mt-1 text-slate-400">{t("storefrontBody")}</p>
                  <Link href="/settings" className="mt-1 inline-flex text-emerald-300 hover:underline">{t("storefrontCta")}</Link>
                </div>
              </div>
            </div>}

            <p className="mt-5 text-center text-[11px] leading-5 text-slate-500">
              {t("agreementPrefix")}
              <Link href="/terms" className="text-indigo-300 hover:underline mx-1">{t("terms")}</Link>
              {t("and")}
              <Link href="/privacy" className="text-indigo-300 hover:underline ml-1">{t("privacy")}</Link>
              {!iosApp && <><br /><Link href="/plans" className="text-emerald-300 hover:underline">{t("viewPlans")}</Link></>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 backdrop-blur border border-white/5 hover:bg-white/10 transition">
      <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-indigo-500/30 to-emerald-500/30 flex items-center justify-center text-white">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-medium text-white text-sm">{title}</div>
        <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}
