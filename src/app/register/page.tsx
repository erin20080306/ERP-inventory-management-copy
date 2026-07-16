"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import { Loader2, UserPlus, Building2, Store, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import type { BusinessMode } from "@/lib/product-editions";

const ROLES = [
  { name: "系統管理員", desc: "擁有所有權限" },
];

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

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "POS" || mode === "POS_RETAIL") setBusinessMode("POS_RETAIL");
    if (mode === "POS_RESTAURANT") setBusinessMode("POS_RESTAURANT");
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
    <div className="min-h-screen relative overflow-hidden bg-slate-950 flex items-center justify-center p-4">
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

      <div className="relative w-full max-w-md mx-auto">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold">艾琳設計管理系統</h1>
            <p className="text-xs text-slate-400">建立公司與管理者帳號</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">建立帳號</h2>
            <p className="text-sm text-slate-400 mt-1">註冊後可完整試用 3 日，到期後保留資料並封鎖操作</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-slate-300 text-xs mb-2">使用模式</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setBusinessMode("ERP")}
                  className={`h-16 rounded-xl border flex items-center justify-center gap-2 text-sm transition ${businessMode === "ERP" ? "border-indigo-400 bg-indigo-500/20 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}
                >
                  <Building2 className="h-4 w-4" />一般企業 ERP
                </button>
                <button
                  type="button"
                  onClick={() => setBusinessMode("POS_RETAIL")}
                  className={`h-16 rounded-xl border flex items-center justify-center gap-2 text-sm transition ${businessMode === "POS_RETAIL" ? "border-emerald-400 bg-emerald-500/20 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}
                >
                  <Store className="h-4 w-4" />零售 POS
                </button>
                <button
                  type="button"
                  onClick={() => setBusinessMode("POS_RESTAURANT")}
                  className={`h-16 rounded-xl border flex items-center justify-center gap-2 text-sm transition ${businessMode === "POS_RESTAURANT" ? "border-orange-400 bg-orange-500/20 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}
                >
                  <UtensilsCrossed className="h-4 w-4" />餐飲 POS
                </button>
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="companyName" className="text-slate-300 text-xs">公司／店家名稱</Label>
              <Input
                id="companyName"
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                placeholder={businessMode === "POS_RESTAURANT" ? "例如：艾琳小館" : businessMode === "POS_RETAIL" ? "例如：艾琳生活選物店" : "例如：艾琳設計有限公司"}
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
    </div>
  );
}
