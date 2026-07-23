"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { PLAN_CATALOG, formatTwd, getPlanPrice, type BillingCycle, type PlanCode } from "@/lib/plans";

type TenantRow = {
  id: string;
  name: string;
  businessMode: string;
  deviceCount: number;
  serverCount: number;
  connection: { companyCode: string | null };
  license: {
    status: "paid" | "trial" | "expired" | "locked";
    planCode?: string | null;
    paymentType?: string | null;
    seatLimit: number;
    keyPrefix?: string | null;
  };
};

type KeyResult = {
  companyCode: string;
  activationKey: string;
  revokedDevices?: number;
  warning?: string;
};

type PaymentMethod = "BANK_TRANSFER" | "CASH" | "OTHER";

function toLocalDateTimeInput(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function statusLabel(status: TenantRow["license"]["status"]) {
  if (status === "paid") return "已開通";
  if (status === "trial") return "試用中";
  if (status === "expired") return "試用已到期";
  return "授權鎖定";
}

export default function ActivationKeyAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<KeyResult | null>(null);
  const [message, setMessage] = useState("");

  const [planCode, setPlanCode] = useState<PlanCode>("TEAM_2");
  const [billing, setBilling] = useState<BillingCycle>("MONTHLY");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");
  const [paidAt, setPaidAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/tenants?page=1&pageSize=50", { cache: "no-store" });
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
  const selectedPlan = useMemo(() => PLAN_CATALOG.find((item) => item.code === planCode) ?? PLAN_CATALOG[0], [planCode]);
  const price = getPlanPrice(selectedPlan, billing, selected?.businessMode);

  useEffect(() => {
    if (!selected) return;
    const existingPlan = PLAN_CATALOG.find((item) => item.code === selected.license.planCode)?.code ?? "TEAM_2";
    const existingBilling = (["MONTHLY", "ANNUAL", "ONCE"] as const).includes(selected.license.paymentType as BillingCycle)
      ? selected.license.paymentType as BillingCycle
      : "MONTHLY";
    setPlanCode(existingPlan);
    setBilling(existingBilling);
    setConfirmed(false);
    setPaymentConfirmed(false);
    setPaymentReference("");
    setPaymentNotes("");
    setPaidAt(toLocalDateTimeInput(new Date()));
    setResult(null);
  }, [selectedId]);

  useEffect(() => {
    setPaidAmount(String(price));
  }, [price]);

  async function activateInitial() {
    if (!selected || selected.license.status === "paid" || !paymentConfirmed) return;
    const paymentDate = new Date(paidAt);
    if (Number.isNaN(paymentDate.getTime())) return setMessage("付款時間格式錯誤");
    if (paymentReference.trim().length < 3) return setMessage("請輸入至少 3 個字元的付款參考編號");
    if (!Number.isFinite(Number(paidAmount)) || Number(paidAmount) <= 0) return setMessage("實收金額必須大於 0");

    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/licenses/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selected.id,
          planCode,
          billing,
          rotateKey: true,
          payment: {
            confirmation: "PAYMENT_RECEIVED",
            paidAmount: Number(paidAmount),
            paidAt: paymentDate.toISOString(),
            paymentMethod,
            paymentReference: paymentReference.trim(),
            notes: paymentNotes.trim() || null,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "方案開通失敗");
      if (!data.activationKey) throw new Error("方案已開通，但未收到啟用碼，請重試重發功能");
      setResult({ companyCode: data.companyCode, activationKey: data.activationKey, revokedDevices: 0, warning: data.warning });
      setPaymentConfirmed(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "方案開通失敗");
    } finally {
      setBusy(false);
    }
  }

  async function rotateKey() {
    if (!selected || selected.license.status !== "paid" || !confirmed) return;
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
    await navigator.clipboard.writeText(result.activationKey);
    setMessage("啟用碼已複製；客戶安裝時只需輸入此碼");
  }

  if (status === "loading") return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><KeyRound className="h-6 w-6 text-amber-300" /><h1 className="text-2xl font-bold">啟用碼與方案開通</h1></div>
            <p className="mt-2 text-sm leading-6 text-slate-400">未開通公司可直接在此完成付款開通並取得第一組啟用碼；已開通公司可在原碼遺失時重發，不會新增付款紀錄。</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />更新</button>
            <Link href="/admin" className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />返回後台</Link>
          </div>
        </header>

        {message && <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-100">{message}</div>}

        {result ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6">
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" /><div><h2 className="text-lg font-bold text-amber-100">啟用碼已產生</h2><p className="mt-1 text-sm text-amber-100/80">只顯示這一次，請立即安全保存。</p></div></div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">公司代碼</div><div className="mt-1 break-all font-mono text-lg font-bold text-sky-300">{result.companyCode}</div></div>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">啟用碼</div><div className="mt-1 break-all font-mono text-base font-bold text-white">{result.activationKey}</div></div>
              {(result.revokedDevices ?? 0) > 0 && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">已撤銷 {result.revokedDevices} 台舊裝置。公司主機與工作站需改用新啟用碼重新連線。</div>}
              <button onClick={() => void copyResult()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 font-bold text-slate-950"><Copy className="h-4 w-4" />複製客戶啟用碼</button>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <label className="block text-sm font-semibold text-slate-300">選擇公司
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading || busy} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white">
                {rows.map((row) => <option key={row.id} value={row.id}>{row.name}・{row.connection.companyCode || "尚無公司代碼"}</option>)}
              </select>
            </label>

            {selected && <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">公司代碼</div><div className="mt-1 font-mono text-sm text-sky-300">{selected.connection.companyCode || "尚未產生"}</div></div>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">既有啟用碼</div><div className="mt-1 text-sm text-slate-200">{selected.license.keyPrefix ? `${selected.license.keyPrefix}…（不可還原）` : "尚未建立"}</div></div>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">授權狀態</div><div className="mt-1 text-sm text-slate-200">{statusLabel(selected.license.status)}・{selected.license.planCode || "尚未正式開通方案"}</div></div>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">目前裝置</div><div className="mt-1 text-sm text-slate-200">工作站 {selected.deviceCount}/{selected.license.seatLimit}・公司主機 {selected.serverCount}/1</div></div>
            </div>}

            {selected?.license.status === "paid" ? (
              <>
                <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
                  <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>重發後，舊啟用碼立即失效。</strong> 已安裝的公司主機與工作站也會撤銷，必須使用新碼重新設定。只有在原碼遺失或確定要全面換碼時才使用。</div></div>
                </div>
                <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-700 p-4 text-sm text-slate-200"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>我確認原啟用碼已遺失或必須作廢，並了解所有舊裝置需要重新連線。</span></label>
                <button onClick={() => void rotateKey()} disabled={busy || loading || !confirmed} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}重發新啟用碼（不新增付款）</button>
              </>
            ) : (
              <>
                <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                  <strong>目前尚未正式開通。</strong> 在其他畫面只選擇方案不會寫入授權資料；必須完成下方付款確認並按「開通並產生啟用碼」，方案才會儲存到資料庫。
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm"><span className="text-slate-400">授權方案</span><select value={planCode} onChange={(event) => setPlanCode(event.target.value as PlanCode)} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3">{PLAN_CATALOG.map((item) => <option key={item.code} value={item.code}>{item.name}（{item.seats} 台）</option>)}</select></label>
                  <label className="space-y-2 text-sm"><span className="text-slate-400">付款週期</span><select value={billing} onChange={(event) => setBilling(event.target.value as BillingCycle)} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="MONTHLY">月租</option><option value="ANNUAL">年租（收 10 個月）</option><option value="ONCE">一次買斷</option></select></label>
                  <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">方案標準金額</div><div className="mt-1 text-xl font-bold text-emerald-300">{formatTwd(price)}</div><div className="mt-1 text-xs text-slate-500">上限 {selectedPlan.seats} 台工作站</div></div>
                  <label className="space-y-2 text-sm"><span className="text-slate-400">實收金額（TWD）</span><input type="number" min="1" step="1" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3" /></label>
                  <label className="space-y-2 text-sm"><span className="text-slate-400">付款方式</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="BANK_TRANSFER">銀行轉帳</option><option value="CASH">現金</option><option value="OTHER">其他</option></select></label>
                  <label className="space-y-2 text-sm"><span className="text-slate-400">付款參考編號</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="例如：日期＋匯款末五碼" maxLength={100} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3" /></label>
                  <label className="space-y-2 text-sm"><span className="text-slate-400">實際入帳時間</span><input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3" /></label>
                  <label className="space-y-2 text-sm sm:col-span-2"><span className="text-slate-400">備註（選填）</span><textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} rows={2} maxLength={500} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
                </div>
                <label className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm text-emerald-100"><input type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} className="mt-1" /><span>我已向付款平台／銀行確認款項實際入帳，並同意建立付款紀錄、開通方案及產生啟用碼。</span></label>
                <button onClick={() => void activateInitial()} disabled={busy || loading || !paymentConfirmed || paymentReference.trim().length < 3 || Number(paidAmount) <= 0} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}完成付款開通並產生啟用碼</button>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
