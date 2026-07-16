"use client";

import { useEffect, useState } from "react";
import { BadgePercent, Check, Loader2, RefreshCw, Ticket, X } from "lucide-react";
import { toast } from "sonner";

const empty = { code: "", name: "", kind: "PERCENT", value: "", minSpend: "0" };

export default function PosOffersPage() {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [promotion, setPromotion] = useState(empty);
  const [coupon, setCoupon] = useState({ ...empty, maxUses: "", perCustomerLimit: "1" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const [offersRes, approvalsRes] = await Promise.all([fetch("/api/pos/offers?all=1", { cache: "no-store" }), fetch("/api/pos/approvals", { cache: "no-store" })]);
      const [offersData, approvalsData] = await Promise.all([offersRes.json(), approvalsRes.json()]);
      if (!offersRes.ok) throw new Error(offersData.error || "促銷載入失敗");
      if (!approvalsRes.ok) throw new Error(approvalsData.error || "折扣核准載入失敗");
      setPromotions(offersData.promotions ?? []);
      setCoupons(offersData.coupons ?? []);
      setApprovals(approvalsData.items ?? []);
    } catch (error: any) { toast.error(error.message); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  async function post(payload: any) {
    setBusy(true);
    try {
      const res = await fetch("/api/pos/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      toast.success("設定已儲存");
      await load();
    } catch (error: any) { toast.error(error.message); } finally { setBusy(false); }
  }

  async function decide(approvalId: string, action: "APPROVE" | "REJECT") {
    setBusy(true);
    try {
      const res = await fetch("/api/pos/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, approvalId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "核准失敗");
      toast.success(action === "APPROVE" ? "折扣已核准" : "折扣已拒絕");
      await load();
    } catch (error: any) { toast.error(error.message); } finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h1 className="text-2xl font-bold flex items-center gap-2"><BadgePercent className="h-6 w-6 text-indigo-600" />促銷、優惠券與店長授權</h1><p className="text-sm text-muted-foreground mt-1">結帳由伺服器重新計算門檻、使用次數與會員點數，避免只改前端金額。</p></div><button onClick={load} disabled={busy} className="h-10 px-4 rounded-lg border inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" />重新整理</button></header>
    <section className="rounded-2xl border bg-card p-5 space-y-4"><div className="font-bold">待核准手動折扣</div>{approvals.filter((item) => item.status === "PENDING").map((item) => <div key={item.id} className="rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div className="font-medium">原因：{item.reason}</div><div className="text-xs text-muted-foreground mt-1">申請人 {item.requestedById} · 到期 {new Date(item.expiresAt).toLocaleString("zh-TW")} · 折扣 {Number((item.payload as any)?.items?.reduce((sum: number, line: any) => sum + Number(line.discount), 0) ?? 0).toLocaleString()} 元</div></div><div className="flex gap-2"><button onClick={() => decide(item.id, "REJECT")} disabled={busy} className="h-9 px-3 rounded-lg border inline-flex items-center gap-1"><X className="h-4 w-4" />拒絕</button><button onClick={() => decide(item.id, "APPROVE")} disabled={busy} className="h-9 px-3 rounded-lg bg-emerald-600 text-white inline-flex items-center gap-1"><Check className="h-4 w-4" />核准</button></div></div>)}{!approvals.some((item) => item.status === "PENDING") && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">目前沒有待核准折扣</div>}</section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border bg-card p-5 space-y-4"><div className="font-bold flex items-center gap-2"><BadgePercent className="h-5 w-5" />自動促銷（擇優一筆）</div><div className="grid grid-cols-2 gap-2"><input placeholder="代碼" value={promotion.code} onChange={(e) => setPromotion({ ...promotion, code: e.target.value.toUpperCase() })} className="h-9 rounded-lg border px-3" /><input placeholder="名稱" value={promotion.name} onChange={(e) => setPromotion({ ...promotion, name: e.target.value })} className="h-9 rounded-lg border px-3" /><select value={promotion.kind} onChange={(e) => setPromotion({ ...promotion, kind: e.target.value })} className="h-9 rounded-lg border bg-background px-3"><option value="PERCENT">百分比</option><option value="AMOUNT">固定金額</option></select><input placeholder="折扣值" value={promotion.value} onChange={(e) => setPromotion({ ...promotion, value: e.target.value })} inputMode="decimal" className="h-9 rounded-lg border px-3" /><input placeholder="最低消費" value={promotion.minSpend} onChange={(e) => setPromotion({ ...promotion, minSpend: e.target.value })} inputMode="decimal" className="h-9 rounded-lg border px-3" /><button onClick={() => post({ action: "SAVE_PROMOTION", ...promotion, priority: 0, isActive: true })} className="h-9 rounded-lg bg-indigo-600 text-white">儲存促銷</button></div><div className="space-y-2">{promotions.map((item) => <div key={item.id} className="rounded-lg border p-3 flex justify-between gap-3 text-sm"><div><strong>{item.code}</strong> · {item.name}<div className="text-xs text-muted-foreground mt-1">滿 {Number(item.minSpend)}，{item.kind === "PERCENT" ? `${Number(item.value)}%` : `折 ${Number(item.value)} 元`}</div></div><button onClick={() => post({ action: "TOGGLE_PROMOTION", id: item.id, isActive: !item.isActive })} className="text-xs text-indigo-700">{item.isActive ? "停用" : "啟用"}</button></div>)}</div></section>
      <section className="rounded-2xl border bg-card p-5 space-y-4"><div className="font-bold flex items-center gap-2"><Ticket className="h-5 w-5" />優惠券</div><div className="grid grid-cols-2 gap-2"><input placeholder="代碼" value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} className="h-9 rounded-lg border px-3" /><input placeholder="名稱" value={coupon.name} onChange={(e) => setCoupon({ ...coupon, name: e.target.value })} className="h-9 rounded-lg border px-3" /><select value={coupon.kind} onChange={(e) => setCoupon({ ...coupon, kind: e.target.value })} className="h-9 rounded-lg border bg-background px-3"><option value="PERCENT">百分比</option><option value="AMOUNT">固定金額</option></select><input placeholder="折扣值" value={coupon.value} onChange={(e) => setCoupon({ ...coupon, value: e.target.value })} inputMode="decimal" className="h-9 rounded-lg border px-3" /><input placeholder="最低消費" value={coupon.minSpend} onChange={(e) => setCoupon({ ...coupon, minSpend: e.target.value })} inputMode="decimal" className="h-9 rounded-lg border px-3" /><input placeholder="總使用上限（空白不限）" value={coupon.maxUses} onChange={(e) => setCoupon({ ...coupon, maxUses: e.target.value })} inputMode="numeric" className="h-9 rounded-lg border px-3" /><input placeholder="每會員上限" value={coupon.perCustomerLimit} onChange={(e) => setCoupon({ ...coupon, perCustomerLimit: e.target.value })} inputMode="numeric" className="h-9 rounded-lg border px-3" /><button onClick={() => post({ action: "SAVE_COUPON", ...coupon, maxUses: coupon.maxUses ? Number(coupon.maxUses) : null, maxDiscount: null, isActive: true })} className="h-9 rounded-lg bg-indigo-600 text-white">儲存優惠券</button></div><div className="space-y-2">{coupons.map((item) => <div key={item.id} className="rounded-lg border p-3 flex justify-between gap-3 text-sm"><div><strong>{item.code}</strong> · {item.name}<div className="text-xs text-muted-foreground mt-1">已使用 {item.usedCount}{item.maxUses ? ` / ${item.maxUses}` : ""}</div></div><button onClick={() => post({ action: "TOGGLE_COUPON", id: item.id, isActive: !item.isActive })} className="text-xs text-indigo-700">{item.isActive ? "停用" : "啟用"}</button></div>)}</div></section>
    </div>
    {busy && <div className="fixed bottom-5 right-5 rounded-full bg-slate-950 text-white p-3"><Loader2 className="h-5 w-5 animate-spin" /></div>}
  </div>;
}
