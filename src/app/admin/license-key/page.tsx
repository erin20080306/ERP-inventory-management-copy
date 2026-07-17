"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";

type TenantRow = {
  id: string;
  name: string;
  deviceCount: number;
  serverCount: number;
  connection: { companyCode: string | null };
  license: {
    status: "paid" | "trial" | "expired" | "locked";
    planCode?: string | null;
    seatLimit: number;
    keyPrefix?: string | null;
  };
};

type RotateResult = {
  companyCode: string;
  activationKey: string;
  revokedDevices: number;
  warning: string;
};

export default function ActivationKeyAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<RotateResult | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/tenants?page=1&pageSize=100", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "無法載入公司資料");
      const tenants = (data.rows || []) as TenantRow[];
      setRows(tenants);
      setSelectedId((current) => current || tenants[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法載入公司資料");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
    void load();
  }, [router, session, status]);

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);

  async function rotateKey() {
    if (!selected || !confirmed) return;
    const affected = selected.deviceCount + selected.serverCount;
    const prompt = affected > 0
      ? `此操作會讓 ${affected} 台既有公司主機／工作站失效，必須使用新啟用碼重新安裝或重新連線。確定重發？`
      : "新啟用碼只會顯示一次。確定重發？";
    if (!window.confirm(prompt)) return;

    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/licenses/rotate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selected.id, confirmation: "ROTATE_ACTIVATION_KEY" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "啟用碼重發失敗");
      setResult(data);
      setConfirmed(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "啟用碼重發失敗");
    } finally {
      setBusy(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(`公司代碼：${result.companyCode}\n啟用碼：${result.activationKey}`);
    setMessage("公司代碼與啟用碼已複製");
  }

  if (status === "loading") return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><KeyRound className="h-6 w-6 text-amber-300" /><h1 className="text-2xl font-bold">啟用碼管理</h1></div>
            <p className="mt-2 text-sm leading-6 text-slate-400">原啟用碼只保存雜湊，無法再次查看。遺失時可在此直接重發，不會新增付款紀錄。</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />更新</button>
            <Link href="/admin" className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />返回後台</Link>
          </div>
        </header>

        {message && <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-100">{message}</div>}

        {result ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6">
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" /><div><h2 className="text-lg font-bold text-amber-100">新啟用碼已產生</h2><p className="mt-1 text-sm text-amber-100/80">只顯示這一次，請立即安全保存。</p></div></div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">公司代碼</div><div className="mt-1 break-all font-mono text-lg font-bold text-sky-300">{result.companyCode}</div></div>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">啟用碼</div><div className="mt-1 break-all font-mono text-base font-bold text-white">{result.activationKey}</div></div>
              {result.revokedDevices > 0 && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">已撤銷 {result.revokedDevices} 台舊裝置。公司主機與工作站需改用新啟用碼重新連線。</div>}
              <button onClick={() => void copyResult()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 font-bold text-slate-950"><Copy className="h-4 w-4" />複製公司代碼與啟用碼</button>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <label className="block text-sm font-semibold text-slate-300">選擇公司
              <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setConfirmed(false); }} disabled={loading || busy} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white">
                {rows.map((row) => <option key={row.id} value={row.id}>{row.name}・{row.connection.companyCode || "尚無公司代碼"}</option>)}
              </select>
            </label>

            {selected && <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">公司代碼</div><div className="mt-1 font-mono text-sm text-sky-300">{selected.connection.companyCode || "尚未產生"}</div></div>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">既有啟用碼</div><div className="mt-1 text-sm text-slate-200">{selected.license.keyPrefix ? `${selected.license.keyPrefix}…（不可還原）` : "尚未建立"}</div></div>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">授權狀態</div><div className="mt-1 text-sm text-slate-200">{selected.license.status}・{selected.license.planCode || "未選方案"}</div></div>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">目前裝置</div><div className="mt-1 text-sm text-slate-200">工作站 {selected.deviceCount}/{selected.license.seatLimit}・公司主機 {selected.serverCount}/1</div></div>
            </div>}

            <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>重發後，舊啟用碼立即失效。</strong> 已安裝的公司主機與工作站也會撤銷，必須使用新碼重新設定。只有在原碼遺失或確定要全面換碼時才使用。</div></div>
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-700 p-4 text-sm text-slate-200"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>我確認原啟用碼已遺失或必須作廢，並了解所有舊裝置需要重新連線。</span></label>
            <button onClick={() => void rotateKey()} disabled={busy || loading || !selected || !confirmed || selected.license.status !== "paid"} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}重發新啟用碼（不新增付款）</button>
            {selected && selected.license.status !== "paid" && <p className="mt-2 text-center text-xs text-amber-300">此公司尚未完成有效授權開通，請先回管理後台開通方案。</p>}
          </section>
        )}
      </div>
    </main>
  );
}
