"use client";

import { useEffect, useState } from "react";
import { FileCheck2, Loader2, Plus, RefreshCw, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { formatTwd } from "@/lib/plans";

const STATUS_LABELS: Record<string, string> = { QUEUED: "待傳送", ISSUED: "已開立", FAILED: "失敗", VOIDED: "已作廢" };

export default function PosEInvoicesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [eligibleSales, setEligibleSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ saleId: "", mode: "PAPER", buyerTaxId: "", carrierId: "", donationCode: "" });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/e-invoices", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "電子發票佇列載入失敗");
      setItems(data.items ?? []);
      setEligibleSales(data.eligibleSales ?? []);
      setReadiness(data.readiness ?? null);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function retry(eventId: string) {
    setRetrying(eventId);
    try {
      const res = await fetch("/api/pos/e-invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "重送失敗");
      toast.success(data.event?.status === "COMPLETED" ? "電子發票事件已完成" : "已重送，但介接仍未完成");
      await load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRetrying("");
    }
  }

  async function issueInvoice(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/pos/e-invoices/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "電子發票新增失敗");
      toast.success(data.invoice?.status === "ISSUED" ? "電子發票已開立" : "電子發票已加入傳送佇列");
      setShowCreate(false);
      setForm({ saleId: "", mode: "PAPER", buyerTaxId: "", carrierId: "", donationCode: "" });
      await load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h1 className="text-2xl font-bold flex items-center gap-2"><FileCheck2 className="h-6 w-6 text-indigo-600" />電子發票傳送佇列</h1><p className="text-sm text-muted-foreground mt-1">追蹤開立、作廢、折讓事件及失敗重送；正式模式需 Turnkey／VAN 憑證與字軌。</p></div><div className="flex gap-2"><button onClick={() => setShowCreate(true)} className="h-10 px-4 rounded-lg bg-indigo-600 text-white inline-flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />新增／補開</button><button onClick={load} disabled={loading} className="h-10 px-4 rounded-lg border inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" />重新整理</button></div></header>
      {readiness && <section className={`rounded-xl border p-4 text-sm ${readiness.ready ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong>介接狀態：{readiness.provider}／{readiness.environment}</strong><span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold">{readiness.ready ? "可執行目前環境" : "尚未取得正式資格"}</span></div><div className="mt-2 text-xs">訊息版本：{readiness.migVersion || "未設定"} · 財政部傳輸時限提醒：開立後 {readiness.transmissionDeadlineHours} 小時內</div>{readiness.blockers?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5">{readiness.blockers.map((item: string) => <li key={item}>{item}</li>)}</ul>}{readiness.warnings?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-amber-800">{readiness.warnings.map((item: string) => <li key={item}>{item}</li>)}</ul>}</section>}
      {items.some((item) => item.provider === "MOCK") && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>本機測試模式：</strong>TEST- 開頭的號碼不會上傳財政部，不可報稅或兌獎。</div>}
      {showCreate && <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold">新增／補開電子發票</h2><p className="mt-1 text-xs text-muted-foreground">只能選擇已完成且尚未開票的 POS 交易。正式介接未就緒時系統會拒絕送出，不會產生假發票。</p></div><button onClick={() => setShowCreate(false)} className="rounded-lg border p-2" aria-label="關閉"><X className="h-4 w-4" /></button></div><form onSubmit={issueInvoice} className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm">POS 交易<select value={form.saleId} onChange={(event) => setForm((current) => ({ ...current, saleId: event.target.value }))} required className="mt-1 h-10 w-full rounded-lg border bg-background px-3"><option value="">請選擇交易</option>{eligibleSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.number}・{formatTwd(Number(sale.total))}{sale.customer?.companyName ? `・${sale.customer.companyName}` : ""}</option>)}</select></label><label className="text-sm">開立方式<select value={form.mode} onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border bg-background px-3"><option value="PAPER">紙本證明聯</option><option value="MOBILE_CARRIER">手機條碼載具</option><option value="CITIZEN_CERT">自然人憑證載具</option><option value="DONATION">捐贈</option><option value="BUSINESS">公司戶統編</option></select></label>{form.mode === "BUSINESS" && <label className="text-sm">買方統一編號<input value={form.buyerTaxId} onChange={(event) => setForm((current) => ({ ...current, buyerTaxId: event.target.value }))} maxLength={8} required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" /></label>}{["MOBILE_CARRIER", "CITIZEN_CERT"].includes(form.mode) && <label className="text-sm">載具號碼<input value={form.carrierId} onChange={(event) => setForm((current) => ({ ...current, carrierId: event.target.value }))} required className="mt-1 h-10 w-full rounded-lg border bg-background px-3 font-mono" /></label>}{form.mode === "DONATION" && <label className="text-sm">捐贈碼<input value={form.donationCode} onChange={(event) => setForm((current) => ({ ...current, donationCode: event.target.value }))} maxLength={7} required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" /></label>}<div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-xs"><span>{eligibleSales.length ? `可補開 ${eligibleSales.length} 筆交易` : "目前沒有可補開的交易"}{readiness && !readiness.ready ? "；正式介接尚未就緒" : ""}</span><button type="submit" disabled={creating || !form.saleId || !readiness?.ready} className="h-10 rounded-lg bg-indigo-600 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{creating ? "處理中…" : readiness?.ready ? "確認新增並送出" : "介接完成後可送出"}</button></div></form></section>}
      <section className="rounded-2xl border bg-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3 text-left">交易</th><th className="p-3 text-left">開立方式</th><th className="p-3 text-left">服務</th><th className="p-3 text-left">發票號碼</th><th className="p-3 text-right">金額</th><th className="p-3 text-left">狀態／錯誤</th><th className="p-3 text-right">操作</th></tr></thead><tbody>
        {items.map((item) => { const failed = item.events?.find((event: any) => event.status === "FAILED"); return <tr key={item.id} className="border-t align-top"><td className="p-3"><div className="font-mono text-xs">{item.posSale.number}</div><div className="text-xs text-muted-foreground mt-1">{new Date(item.createdAt).toLocaleString("zh-TW")}</div></td><td className="p-3">{item.mode}</td><td className="p-3">{item.provider === "MOCK" ? "本機模擬" : item.provider}</td><td className="p-3 font-mono text-xs">{item.invoiceNumber || "—"}</td><td className="p-3 text-right font-semibold">{formatTwd(Number(item.posSale.total))}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${item.status === "FAILED" ? "bg-rose-100 text-rose-800" : item.status === "ISSUED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{STATUS_LABELS[item.status] || item.status}</span>{(item.lastError || failed?.lastError) && <div className="mt-2 max-w-md text-xs text-rose-700">{item.lastError || failed.lastError}</div>}</td><td className="p-3 text-right">{failed && <button onClick={() => retry(failed.id)} disabled={retrying === failed.id} className="h-9 px-3 rounded-lg border inline-flex items-center gap-2">{retrying === failed.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}主管重送</button>}</td></tr>; })}
        {!loading && items.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">尚無電子發票事件</td></tr>}
        {loading && <tr><td colSpan={7} className="p-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>}
      </tbody></table></div></section>
    </div>
  );
}
