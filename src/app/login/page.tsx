"use client";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Lock, User, Building2, ShieldCheck, BarChart3, Package, Sparkles } from "lucide-react";
import { TrialGate } from "@/components/trial-gate";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <TrialGate>
        <LoginInner />
      </TrialGate>
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/dashboard";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
        <div className="hidden md:block text-white space-y-8">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-wide bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                專業 ERP 管理系統
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">Enterprise Resource Planning</p>
            </div>
          </div>

          <div className="space-y-4">
            <Feature icon={<Package className="h-5 w-5" />} title="完整進銷存管理" desc="商品 / 採購 / 銷售 / 庫存即時掌握" />
            <Feature icon={<BarChart3 className="h-5 w-5" />} title="專業會計系統" desc="傳票 / AR / AP / 損益 / 試算 / 資產負債" />
            <Feature icon={<ShieldCheck className="h-5 w-5" />} title="企業級安全" desc="RBAC 角色權限 + 操作稽核紀錄" />
            <Feature icon={<Sparkles className="h-5 w-5" />} title="一鍵雲端部署" desc="GitHub + Vercel + PostgreSQL" />
          </div>

          <div className="pt-4 border-t border-white/10 text-xs text-slate-500">
            © {new Date().getFullYear()} Professional ERP System · 安全 · 高效 · 易用
          </div>
        </div>

        {/* 右側登入卡 */}
        <div className="w-full max-w-md mx-auto md:ml-auto">
          {/* 手機版品牌 */}
          <div className="md:hidden mb-6 flex items-center justify-center gap-3 text-white">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">專業 ERP 系統</h1>
              <p className="text-xs text-slate-400">進銷存 / 會計 / 報表</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">歡迎回來</h2>
              <p className="text-sm text-slate-400 mt-1">請輸入您的帳號密碼以繼續</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-slate-300 text-xs">
                  帳號
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="username"
                    className="pl-9 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
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
