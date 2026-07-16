"use client";
import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Lock, User, Building2, ShieldCheck, BarChart3, Package, Sparkles, Download } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner />
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

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = normalizeCallbackUrl(sp.get("callbackUrl"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLocalPreview, setIsLocalPreview] = useState(false);
  const registered = sp.get("registered") === "1";

  useEffect(() => {
    setIsLocalPreview(["127.0.0.1", "localhost"].includes(window.location.hostname));
    const registeredUsername = sp.get("username")?.trim();
    if (registeredUsername) setUsername(registeredUsername);
  }, [sp]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", { username, password, redirect: false, callbackUrl });
    setLoading(false);
    if (res?.error) {
      toast.error(res.error === "CredentialsSignin" ? "帳號或密碼錯誤" : res.error);
      return;
    }
    toast.success("登入成功");
    // 標記首次登入，讓手機版選單自動展開
    try { sessionStorage.setItem("erp_just_logged_in", "1"); } catch {}
    // 登入後依平台管理者／公司模式進入正確工作區。
    try {
      const sess = await fetch("/api/auth/session").then((r) => r.json());
      if (sess?.user?.isSuperAdmin) {
        window.location.href = "/admin";
        return;
      }
      if (!sp.get("callbackUrl")) {
        window.location.href = "/workspace";
        return;
      }
    } catch {}
    // 整頁導航，避免 push+refresh 需要按兩次的問題
    window.location.href = callbackUrl;
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
                艾琳設計 ERP／POS 系統
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">Enterprise &amp; Point of Sale Management</p>
            </div>
          </div>

          <div className="space-y-3 md:space-y-4">
            <Feature icon={<Package className="h-4 w-4 md:h-5 md:w-5" />} title="完整進銷存管理" desc="商品 / 採購 / 銷售 / 庫存即時掌握" />
            <Feature icon={<BarChart3 className="h-4 w-4 md:h-5 md:w-5" />} title="專業會計系統" desc="傳票 / AR / AP / 損益 / 試算 / 資產負債" />
            <Feature icon={<ShieldCheck className="h-4 w-4 md:h-5 md:w-5" />} title="企業級安全" desc="RBAC 角色權限 + 操作稽核紀錄" />
            <Feature icon={<Sparkles className="h-4 w-4 md:h-5 md:w-5" />} title="ERP／POS 雙模式" desc="一般企業流程 / 門市掃碼結帳 / 電商訂單管理" />
          </div>

          <div className="pt-3 md:pt-4 border-t border-white/10 text-xs text-slate-500 space-y-2 md:space-y-3">
            <div>
              © {new Date().getFullYear()} Professional ERP System · 安全 · 高效 · 易用
            </div>
            <div className="space-y-1">
              <div className="font-medium text-slate-400">服務人員：艾琳設計</div>
              <div className="text-slate-500">erin20080306@gmail.com</div>
              <div className="text-slate-500">Line ID: erin2008</div>
              <a
                href="https://erin.is-a.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 transition"
              >
                網站：https://erin.is-a.dev/
              </a>
            </div>
          </div>
        </div>

        {/* 右側登入卡 */}
        <div className="w-full max-w-md mx-auto md:ml-auto order-1 md:order-2">

          <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">歡迎回來</h2>
              <p className="text-sm text-slate-400 mt-1">請輸入您的帳號密碼以繼續</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {registered && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">帳號已建立完成，帳號已自動帶入；也可以使用註冊 Email 登入。</div>}
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-slate-300 text-xs">
                  帳號或 Email
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="username"
                    className="pl-9 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="請輸入帳號或註冊 Email"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-300 text-xs">
                  密碼
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
                {loading ? "登入中..." : "登入系統"}
              </Button>
            </form>

            {isLocalPreview && (
              <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
                <div className="mb-2 text-center text-[11px] font-semibold text-amber-200">本機預覽・模擬客戶快速登入</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => { setUsername("demo-erp"); setPassword("DemoERP2026!"); }} className="rounded-lg border border-white/10 px-2 py-2 text-[11px] text-slate-300 hover:bg-white/10">企業 ERP</button>
                  <button type="button" onClick={() => { setUsername("demo-retail"); setPassword("DemoRetail2026!"); }} className="rounded-lg border border-white/10 px-2 py-2 text-[11px] text-slate-300 hover:bg-white/10">零售 POS</button>
                  <button type="button" onClick={() => { setUsername("demo-food"); setPassword("DemoFood2026!"); }} className="rounded-lg border border-white/10 px-2 py-2 text-[11px] text-slate-300 hover:bg-white/10">餐飲 POS</button>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => { setUsername("demo-trial"); setPassword("DemoTrial2026!"); }} className="rounded-lg border border-amber-300/20 px-2 py-2 text-[11px] text-amber-200 hover:bg-amber-300/10">試用倒數</button>
                  <button type="button" onClick={() => { setUsername("demo-expired"); setPassword("DemoExpired2026!"); }} className="rounded-lg border border-rose-300/20 px-2 py-2 text-[11px] text-rose-200 hover:bg-rose-300/10">試用到期</button>
                  <button type="button" onClick={() => { setUsername("demo-revoked"); setPassword("DemoRevoked2026!"); }} className="rounded-lg border border-rose-300/20 px-2 py-2 text-[11px] text-rose-200 hover:bg-rose-300/10">授權撤銷</button>
                </div>
              </div>
            )}

            <div className="mt-4 text-center">
              <Link href="/solutions" className="text-sm text-slate-400 hover:text-white transition">
                還沒有帳號？<span className="text-indigo-400 font-medium">選擇模式並試用</span>
              </Link>
            </div>

            <div className="mt-4 rounded-xl border border-sky-300/20 bg-sky-300/5 p-3 text-xs leading-5 text-slate-400">
              <div className="flex items-start gap-2"><Download className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /><p><span className="font-semibold text-sky-200">線上版只供 3 日試用。</span>正式使用請先選擇方案並聯絡付款，開通後才提供 macOS／Windows 公司主機與工作站安裝包。</p></div>
              <div className="mt-2 flex flex-wrap gap-3 pl-6"><Link href="/plans" className="text-emerald-300 hover:underline">費率與開通方式</Link><Link href="/terms" className="text-indigo-300 hover:underline">產品條款</Link><Link href="/refund" className="text-indigo-300 hover:underline">退款政策</Link></div>
            </div>

            <p className="mt-5 text-center text-[11px] leading-5 text-slate-500">
              登入即表示你已閱讀
              <Link href="/terms" className="text-indigo-300 hover:underline mx-1">服務條款與聲明</Link>
              及
              <Link href="/privacy" className="text-indigo-300 hover:underline ml-1">隱私權政策</Link>
              <br />
              <Link href="/plans" className="text-emerald-300 hover:underline">查看方案與聯絡開通</Link>
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
