"use client";

import Link from "next/link";
import { cloneElement, useState } from "react";
import { ArrowLeft, Bot, Check, Loader2, Mail, MonitorSmartphone, Send } from "lucide-react";
import { BillingDocumentNotice } from "@/components/billing-document-notice";
import { BILLING_LABELS, PLAN_CATALOG, formatTwd, getPlanPrice, getWebsiteDesignFee, type BillingCycle, type PlanCode } from "@/lib/plans";
import type { BusinessMode } from "@/lib/product-editions";

export default function PlansPage() {
  const [billing, setBilling] = useState<BillingCycle>("MONTHLY");
  const [selected, setSelected] = useState<PlanCode>("TEAM_2");
  const [form, setForm] = useState({ name: "", email: "", company: "", lineId: "", businessMode: "ERP" as BusinessMode, notes: "", consent: false, website: "" });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const selectedPlan = PLAN_CATALOG.find((plan) => plan.code === selected) ?? PLAN_CATALOG[0];
  const websiteDesignFee = getWebsiteDesignFee(billing, form.businessMode);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, plan: selected, billing }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "送出失敗");
      setMessage({ ok: true, text: result.warning || `需求已記錄（編號 ${result.inquiryId}），艾琳設計會聯絡確認付款與開通。` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "送出失敗" });
    } finally { setSending(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-10">
        <header className="flex items-center justify-between gap-4"><Link href="/solutions" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />回到系統選擇</Link><Link href="/login" className="rounded-lg border border-white/15 px-4 py-2 text-sm">登入</Link></header>
        <section className="mx-auto mt-12 max-w-3xl text-center"><p className="text-sm font-semibold text-emerald-300">公開透明・付款後人工確認</p><h1 className="mt-3 text-4xl font-black md:text-5xl">選擇電腦台數與付款方式</h1><p className="mt-4 leading-7 text-slate-400">不在網站直接收款。送出需求後由艾琳設計確認環境、報價與付款，再從管理後台開通。</p></section>

        <div className="mx-auto mt-8 flex w-fit rounded-xl bg-white/5 p-1">
          {(["MONTHLY", "ANNUAL", "ONCE"] as BillingCycle[]).map((cycle) => <button key={cycle} onClick={() => setBilling(cycle)} className={`rounded-lg px-4 py-2 text-sm ${billing === cycle ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"}`}>{BILLING_LABELS[cycle]}</button>)}
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_CATALOG.map((plan) => {
            const active = selected === plan.code;
            return <button key={plan.code} onClick={() => setSelected(plan.code)} className={`rounded-2xl border p-5 text-left transition ${active ? "border-emerald-400 bg-emerald-400/10 shadow-lg shadow-emerald-900/20" : "border-white/10 bg-white/[0.04] hover:border-white/25"}`}>
              <div className="flex items-start justify-between"><div><p className="text-xs text-slate-400">{plan.description}</p><h2 className="mt-2 text-xl font-bold">{plan.name}</h2></div>{active && <Check className="h-5 w-5 text-emerald-300" />}</div>
              <div className="mt-6 text-3xl font-black">{formatTwd(getPlanPrice(plan, billing, form.businessMode))}</div><p className="mt-1 text-xs text-slate-500">{billing === "MONTHLY" ? "每月" : billing === "ANNUAL" ? "每年（等同 10 個月）" : "一次買斷"}</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-300"><li className="flex gap-2"><MonitorSmartphone className="h-4 w-4 text-sky-300" />最多 {plan.seats} 台電腦</li><li className="flex gap-2"><Bot className="h-4 w-4 text-violet-300" />含 AI 輔助功能</li><li className="flex gap-2"><Check className="h-4 w-4 text-emerald-300" />{billing === "ONCE" ? "含一次約定範圍修改設計" : "租期內版本維護"}</li></ul>
            </button>;
          })}
        </section>

        {form.businessMode === "ECOMMERCE" && (
          <section className="mt-5 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-5 text-sm leading-7 text-rose-100">
            <strong className="block text-base text-white">電商商城＋ERP 專用價格</strong>
            <span>月租固定 {formatTwd(2_999)}；年租 {formatTwd(29_990)}，使用 12 個月、等同優惠 2 個月。</span>
            <span className="block">{billing === "ONCE" ? "買斷方案依 1 對 2／3／5／8 席次計價，均含一次官網設計修改。" : `若需更改官網設計，本期設計費另計 ${formatTwd(websiteDesignFee)}；未委託修改則不收取。`}</span>
          </section>
        )}

        <p className="mt-4 text-center text-xs text-slate-500">一次買斷後續版本與 AI 維護為每年 {formatTwd(2_000)}；修改內容與交付範圍以雙方書面確認為準。</p>

        <BillingDocumentNotice companyName={form.company} planName={selectedPlan.name} billing={billing} amount={getPlanPrice(selectedPlan, billing, form.businessMode)} />

        <section className="mx-auto mt-14 grid max-w-5xl gap-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:grid-cols-[.8fr_1.2fr] md:p-9">
          <div><Mail className="h-10 w-10 text-indigo-300" /><h2 className="mt-5 text-2xl font-bold">聯絡艾琳設計開通</h2><p className="mt-3 text-sm leading-6 text-slate-400">送出後通知會寄至 erin20080306@gmail.com。請勿在備註填寫密碼、信用卡或銀行帳戶資料。</p><div className="mt-6 rounded-xl bg-slate-900 p-4 text-sm text-slate-300"><div>已選：{selectedPlan.name}</div><div className="mt-1">付款：{BILLING_LABELS[billing]}</div></div></div>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="姓名"><input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="公司／店名"><input required minLength={2} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Email"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Line ID（選填）"><input value={form.lineId} onChange={(e) => setForm({ ...form, lineId: e.target.value })} /></Field>
            <Field label="系統／業態"><select value={form.businessMode} onChange={(e) => setForm({ ...form, businessMode: e.target.value as BusinessMode })}><option value="ERP">一般企業進銷存會計</option><option value="ECOMMERCE">服飾電商商城＋ERP</option><option value="POS_RETAIL">門市零售 POS＋進銷存＋會計</option><option value="POS_RESTAURANT">餐飲桌位／廚房＋進銷存＋會計</option></select></Field>
            <label className="hidden" aria-hidden="true">網站<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
            <label className="space-y-1.5 text-xs text-slate-400 sm:col-span-2">需求備註<textarea rows={4} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="block w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white outline-none focus:border-indigo-400" /></label>
            <label className="flex items-start gap-2 text-xs leading-5 text-slate-400 sm:col-span-2"><input required type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-1" />我同意依<Link href="/privacy" className="text-indigo-300 underline">隱私權政策</Link>使用本表資料，以回覆方案與開通需求。</label>
            {message && <p className={`text-sm sm:col-span-2 ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>{message.text}</p>}
            <button disabled={sending} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-500 font-bold disabled:opacity-50 sm:col-span-2">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "寄送中…" : "送出需求，等待聯絡開通"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactElement<{ className?: string }> }) {
  return <label className="space-y-1.5 text-xs text-slate-400">{label}<span className="block">{cloneElement(children, { className: "h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-indigo-400" })}</span></label>;
}
