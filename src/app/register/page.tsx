"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import { Loader2, UserPlus, Building2, ShoppingBag, Store, UtensilsCrossed, PlayCircle, X, HeartPulse } from "lucide-react";
import Link from "next/link";
import type { BusinessMode } from "@/lib/product-editions";

const ROLES = [
  { name: "系統管理員", desc: "擁有所有權限" },
];
const MODE_DEMOS: Record<BusinessMode, { label: string; video: string; poster: string }> = {
  ERP: { label: "一般企業 ERP", video: "/videos/erp-demo.webm", poster: "/images/demos/erp-demo.png" },
  ECOMMERCE: { label: "電商商城＋ERP", video: "/videos/ecommerce-erp-demo.webm", poster: "/images/demos/ecommerce-erp-demo.png" },
  POS_RETAIL: { label: "一般零售 POS", video: "/videos/retail-pos-demo.webm", poster: "/images/demos/retail-pos-demo.png" },
  POS_RESTAURANT: { label: "餐飲 POS", video: "/videos/restaurant-pos-demo.webm", poster: "/images/demos/restaurant-pos-demo.png" },
  POS_MEDICAL: { label: "醫美診所營運管理 POS", video: "/videos/medical-pos-demo.webm", poster: "/medical-aesthetics/clinic-hero.png" },
};

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [businessMode, setBusinessMode] = useState<BusinessMode>("ERP");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [roleName, setRoleName] = useState("系統管理員");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDemoVideo, setShowDemoVideo] = useState(false);
  const currentDemo = MODE_DEMOS[businessMode];

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "POS" || mode === "POS_RETAIL") setBusinessMode("POS_RETAIL");
    if (mode === "POS_RESTAURANT") setBusinessMode("POS_RESTAURANT");
    if (mode === "ECOMMERCE") setBusinessMode("ECOMMERCE");
    if (mode === "POS_MEDICAL" || mode === "MEDICAL") setBusinessMode("POS_MEDICAL");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, name, email, companyName, roleName, businessMode, acceptTerms }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || "註冊失敗";
        setError(msg);
        toast.error(msg);
        return;
      }
      const normalizedUsername = data.username as string;
      const login = await signIn("credentials", {
        username: normalizedUsername,
        password,
        redirect: false,
        callbackUrl: "/workspace",
      });
      if (!login?.error) {
        toast.success("註冊成功，已自動登入");
        try { sessionStorage.setItem("erp_just_logged_in", "1"); } catch {}
        window.location.href = "/workspace";
        return;
      }
      toast.success("帳號已建立，請使用畫面帶入的帳號登入");
      router.push(`/login?registered=1&username=${encodeURIComponent(normalizedUsername)}`);
    } catch {
      setError("註冊失敗，請稍後再試");
      toast.error("註冊失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 px-4 py-8 sm:px-6 lg:py-12">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-950 to-emerald-950" />
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-500/30 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold">艾琳設計管理系統</h1>
            <p className="text-xs text-slate-400">建立公司與管理者帳號</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-2xl sm:p-7 lg:p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">建立帳號</h2>
            <p className="text-sm text-slate-400 mt-1">註冊後可完整試用 3 日，到期後保留資料並封鎖操作</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          <form onSubmit={onSubmit} className="min-w-0 space-y-4">
            <fieldset className="min-w-0 space-y-2">
              <legend className="text-slate-300 text-xs mb-2">選擇使用模式（可左右滑動）</legend>
              <div className="grid max-w-full snap-x snap-mandatory grid-flow-col auto-cols-[minmax(168px,1fr)] gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] lg:grid-flow-row lg:grid-cols-5 lg:auto-cols-auto lg:overflow-visible">
                <button type="button" onClick={() => setBusinessMode("ERP")} className={`h-16 min-w-0 snap-start rounded-xl border flex items-center justify-center gap-2 text-sm transition ${businessMode === "ERP" ? "border-indigo-400 bg-indigo-500/20 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}><Building2 className="h-4 w-4" />一般企業 ERP</button>
                <button type="button" onClick={() => setBusinessMode("ECOMMERCE")} className={`h-16 min-w-0 snap-start rounded-xl border flex items-center justify-center gap-2 text-sm transition ${businessMode === "ECOMMERCE" ? "border-rose-400 bg-rose-500/20 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}><ShoppingBag className="h-4 w-4" />電商商城＋ERP</button>
                <button type="button" onClick={() => setBusinessMode("POS_RETAIL")} className={`h-16 min-w-0 snap-start rounded-xl border flex items-center justify-center gap-2 text-sm transition ${businessMode === "POS_RETAIL" ? "border-emerald-400 bg-emerald-500/20 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}><Store className="h-4 w-4" />一般零售 POS</button>
                <button type="button" onClick={() => setBusinessMode("POS_RESTAURANT")} className={`h-16 min-w-0 snap-start rounded-xl border flex items-center justify-center gap-2 text-sm transition ${businessMode === "POS_RESTAURANT" ? "border-orange-400 bg-orange-500/20 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}><UtensilsCrossed className="h-4 w-4" />餐飲 POS</button>
                <button type="button" onClick={() => setBusinessMode("POS_MEDICAL")} className={`min-h-16 min-w-0 snap-start rounded-xl border px-3 py-2 text-left text-sm transition ${businessMode === "POS_MEDICAL" ? "border-fuchsia-300 bg-fuchsia-500/20 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}><span className="flex items-center gap-2 font-semibold"><HeartPulse className="h-4 w-4 shrink-0" />醫美診所營運管理 POS</span><span className="mt-1 block text-[10px] leading-4 opacity-75">整合預約排程、療程套票、會員儲值、同意書、術前術後紀錄、耗材庫存</span></button>
              </div>
              <button type="button" onClick={() => setShowDemoVideo(true)} className="flex w-full items-center justify-between rounded-xl border border-sky-300/20 bg-sky-300/5 px-4 py-3 text-left text-sm text-sky-100 transition hover:bg-sky-300/10">
                <span><b className="block">{currentDemo.label} 示範影片</b><small className="mt-1 block text-sky-200/70">先觀看操作流程，再完成租戶註冊</small></span><PlayCircle className="h-6 w-6 shrink-0" />
              </button>
            </fieldset>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="companyName" className="text-slate-300 text-xs">公司／店家名稱</Label>
              <Input
                id="companyName"
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                placeholder={businessMode === "POS_MEDICAL" ? "例如：艾琳醫美診所" : businessMode === "POS_RESTAURANT" ? "例如：艾琳小館" : businessMode === "POS_RETAIL" ? "例如：艾琳生活選物店" : businessMode === "ECOMMERCE" ? "例如：艾琳服飾品牌" : "例如：艾琳設計有限公司"}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-slate-300 text-xs">姓名</Label>
              <Input
                id="name"
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                placeholder="請輸入姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-300 text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-username" className="text-slate-300 text-xs">帳號</Label>
              <Input
                id="reg-username"
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                placeholder="請輸入帳號"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                autoComplete="username"
                minLength={3}
                maxLength={50}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-password" className="text-slate-300 text-xs">密碼</Label>
              <Input
                id="reg-password"
                type="password"
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                placeholder="8～72 字元，需包含英文與數字"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 accent-indigo-500"
              />
              <span>
                我已閱讀並同意
                <Link href="/terms" target="_blank" className="text-indigo-300 hover:underline mx-1">服務條款與聲明</Link>
                及
                <Link href="/privacy" target="_blank" className="text-indigo-300 hover:underline ml-1">隱私權政策</Link>
              </span>
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-slate-300 text-xs">角色</Label>
              <select
                id="role"
                className="w-full h-11 rounded-md bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r.name} value={r.name} className="bg-slate-900">
                    {r.name} — {r.desc}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-indigo-500 to-emerald-500 hover:from-indigo-600 hover:to-emerald-600 border-0 text-white font-semibold tracking-wide shadow-lg shadow-indigo-500/30"
              disabled={loading || !acceptTerms}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {loading ? "註冊中..." : "註冊帳號"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm text-slate-400 hover:text-white transition">
              已有帳號？<span className="text-indigo-400 font-medium">立即登入</span>
            </Link>
            <span className="text-slate-600 mx-2">·</span>
            <Link href="/solutions" className="text-sm text-slate-400 hover:text-white transition">
              重新選擇模式
            </Link>
          </div>
        </div>
      </div>
      {showDemoVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4" role="dialog" aria-modal="true" aria-label={`${currentDemo.label} 示範影片`}>
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white"><div><b>{currentDemo.label}</b><p className="mt-0.5 text-xs text-slate-400">影片僅示範操作；註冊後會建立您自己的獨立租戶資料。</p></div><button type="button" onClick={() => setShowDemoVideo(false)} className="rounded-lg border border-white/10 p-2 hover:bg-white/10" aria-label="關閉影片"><X className="h-5 w-5" /></button></div>
            <video key={currentDemo.video} src={currentDemo.video} poster={currentDemo.poster} controls autoPlay muted playsInline className="aspect-video w-full bg-black object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
