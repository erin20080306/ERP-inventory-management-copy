"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, UserPlus, Building2, ShieldCheck } from "lucide-react";
import Link from "next/link";

const ROLES = [
  { name: "系統管理員", desc: "擁有所有權限" },
  { name: "老闆 / 經營者", desc: "查看所有報表與資料" },
  { name: "會計人員", desc: "傳票、AR/AP、損益" },
  { name: "採購人員", desc: "採購單、供應商管理" },
  { name: "銷售人員", desc: "銷售單、客戶管理" },
  { name: "倉管人員", desc: "庫存、進出貨管理" },
  { name: "一般查詢人員", desc: "僅能查詢資料" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleName, setRoleName] = useState("一般查詢人員");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, name, email, roleName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "註冊失敗");
        return;
      }
      toast.success("註冊成功！請登入");
      router.push("/login");
    } catch {
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
            <h1 className="text-lg font-bold">專業 ERP 系統</h1>
            <p className="text-xs text-slate-400">註冊新帳號</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">建立帳號</h2>
            <p className="text-sm text-slate-400 mt-1">註冊後可免費試用 2 天</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-password" className="text-slate-300 text-xs">密碼</Label>
              <Input
                id="reg-password"
                type="password"
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-400/40"
                placeholder="至少 4 個字元"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

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
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {loading ? "註冊中..." : "註冊帳號"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm text-slate-400 hover:text-white transition">
              已有帳號？<span className="text-indigo-400 font-medium">立即登入</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
