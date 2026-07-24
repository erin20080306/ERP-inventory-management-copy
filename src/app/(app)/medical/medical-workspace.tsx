"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardSignature,
  ExternalLink,
  FileClock,
  HeartPulse,
  Loader2,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

type Service = {
  id: string;
  code: string;
  category: string;
  durationMinutes: number;
  consentRequired: boolean;
  product: { id: string; name: string; salePrice: number; imageUrl: string | null };
  consumables: Array<{ id: string; quantity: number; unit: string | null; product: { name: string; stockTotal: number } }>;
};
type Package = {
  id: string;
  name: string;
  sessions: number;
  serviceId: string;
  product: { id: string; salePrice: number; imageUrl: string | null };
};
type Customer = { id: string; companyName: string; phone: string | null; email: string | null; walletBalance: number };
type Appointment = {
  id: string;
  number: string;
  startAt: string;
  status: string;
  practitionerName: string;
  consentStatus: string;
  serviceId: string;
  customer: { id: string; companyName: string; phone: string | null };
  service: { product: { name: string; imageUrl: string | null } };
};
type Purchase = {
  id: string;
  customerId: string;
  remainingSessions: number;
  validUntil: string;
  customer: { companyName: string };
  package: { name: string; serviceId: string };
};
type Receipt = { id: string; number: string; patientName: string; total: number; status: string; issuedAt: string };
type MedicalData = {
  services: Service[];
  packages: Package[];
  appointments: Appointment[];
  customers: Customer[];
  purchases: Purchase[];
  receipts: Receipt[];
};
type PosData = {
  registers: Array<{ id: string; code: string; name: string }>;
  openShift: { id: string; openingCash: number; register: { name: string } } | null;
  today?: { netSales?: number; itemQuantity?: number };
  shiftCash?: { expectedCash?: number };
};

const tabs = [
  ["schedule", "今日排程", CalendarDays],
  ["checkout", "快速收款", ReceiptText],
  ["members", "套票／儲值", WalletCards],
  ["records", "同意與紀錄", ClipboardSignature],
] as const;

function money(value: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
}

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "操作失敗");
  return data;
}

export function MedicalWorkspace({ publicSiteHref }: { publicSiteHref: string }) {
  const [medical, setMedical] = useState<MedicalData | null>(null);
  const [pos, setPos] = useState<PosData | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("schedule");
  const [busy, setBusy] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [openingCash, setOpeningCash] = useState("3000");
  const [newPatient, setNewPatient] = useState({ name: "", phone: "", email: "" });
  const [appointmentForm, setAppointmentForm] = useState({ customerId: "", serviceId: "", startAt: "", practitionerName: "林醫師", room: "諮詢室 A" });
  const [walletForm, setWalletForm] = useState({ customerId: "", amount: "5000", paymentMethod: "CASH" });
  const [packageSelections, setPackageSelections] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const nextMedical = await jsonFetch("/api/medical/bootstrap");
      const nextPos = await jsonFetch("/api/pos/bootstrap");
      setMedical(nextMedical);
      setPos(nextPos);
      setCustomerId((current) => current || nextMedical.customers[0]?.id || "");
      setAppointmentForm((current) => ({ ...current, customerId: current.customerId || nextMedical.customers[0]?.id || "", serviceId: current.serviceId || nextMedical.services[0]?.id || "" }));
      setWalletForm((current) => ({ ...current, customerId: current.customerId || nextMedical.customers[0]?.id || "" }));
      setSelectedProductId((current) => current || nextMedical.services[0]?.product.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "載入失敗");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const products = useMemo(() => [
    ...(medical?.services.map((item) => ({ id: item.product.id, name: item.product.name, price: item.product.salePrice, imageUrl: item.product.imageUrl, kind: "服務" })) ?? []),
    ...(medical?.packages.map((item) => ({ id: item.product.id, name: item.name, price: item.product.salePrice, imageUrl: item.product.imageUrl, kind: "套票" })) ?? []),
  ], [medical]);
  const selectedProduct = products.find((item) => item.id === selectedProductId);
  const selectedCustomer = medical?.customers.find((item) => item.id === customerId);

  async function openShift() {
    if (!pos?.registers[0]) return;
    setBusy(true);
    try {
      await jsonFetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "OPEN", registerId: pos.registers[0].id, openingCash: Number(openingCash) }),
      });
      toast.success("醫美櫃台已開班，零用金已保留帳務紀錄");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "開班失敗");
    } finally { setBusy(false); }
  }

  async function createCustomer() {
    setBusy(true);
    try {
      const result = await jsonFetch("/api/medical/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPatient),
      });
      toast.success("已建立就診人資料");
      setNewPatient({ name: "", phone: "", email: "" });
      await load();
      setCustomerId(result.customer.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新增失敗");
    } finally { setBusy(false); }
  }

  async function checkout() {
    if (!pos?.openShift || !selectedProduct || !selectedCustomer) return;
    setBusy(true);
    try {
      const result = await jsonFetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          shiftId: pos.openShift.id,
          customerId,
          items: [{ productId: selectedProduct.id, quantity: 1, discount: 0 }],
          payments: [{ method: paymentMethod, amount: selectedProduct.price }],
          medical: { patientName: selectedCustomer.companyName, practitionerName: "林醫師" },
        }),
      });
      toast.success(`收款完成 ${result.sale.number}，已開立醫療收據`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "結帳失敗");
    } finally { setBusy(false); }
  }

  async function createAppointment() {
    if (!appointmentForm.startAt) return toast.error("請選擇預約時間");
    setBusy(true);
    try {
      await jsonFetch("/api/medical/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CREATE", ...appointmentForm, startAt: new Date(appointmentForm.startAt).toISOString() }),
      });
      toast.success("預約已排入今日行程");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "預約失敗");
    } finally { setBusy(false); }
  }

  async function appointmentAction(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await jsonFetch("/api/medical/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失敗");
    } finally { setBusy(false); }
  }

  async function topUp() {
    const customer = medical?.customers.find((item) => item.id === walletForm.customerId);
    if (!customer) return;
    setBusy(true);
    try {
      const result = await jsonFetch("/api/medical/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...walletForm, amount: Number(walletForm.amount), patientName: customer.companyName }),
      });
      toast.success(`儲值完成，餘額 ${money(result.balanceAfter)}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲值失敗");
    } finally { setBusy(false); }
  }

  if (!medical || !pos) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在準備醫美示範資料…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-rose-100 bg-[#fffaf7] shadow-sm">
        <div className="grid items-center gap-6 p-6 md:grid-cols-[1.2fr_.8fr] md:p-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.24em] text-rose-500"><Sparkles className="h-4 w-4" />Medical Aesthetics Operations</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-stone-900">醫美診所營運管理 POS</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">從官網圖片選服務、預約、同意書、療程套票與會員儲值，到醫療收據、耗材出庫及會計傳票，使用同一租戶資料。</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={publicSiteHref} target="_blank" className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-bold text-white"><ExternalLink className="h-4 w-4" />進入診所官網</Link>
              <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700"><RefreshCw className="h-4 w-4" />重新整理</button>
            </div>
          </div>
          <div className="relative h-44 overflow-hidden rounded-3xl md:h-52">
            <Image src="/medical-aesthetics/clinic-hero.png" alt="專業醫美診所接待空間" fill priority className="object-cover" sizes="(max-width: 768px) 100vw, 40vw" />
          </div>
        </div>
        <div className="grid border-t border-rose-100 bg-white sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["今日預約", `${medical.appointments.length} 筆`, CalendarDays],
            ["本班營業額", money(Number(pos.today?.netSales ?? 0)), ReceiptText],
            ["目前應有現金", money(Number(pos.shiftCash?.expectedCash ?? pos.openShift?.openingCash ?? 0)), WalletCards],
            ["待完成療程", `${medical.appointments.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status)).length} 筆`, FileClock],
          ].map(([label, value, Icon], index) => (
            <div key={String(label)} className={`p-5 ${index ? "border-t sm:border-l sm:border-t-0" : ""}`}>
              <div className="flex items-center justify-between text-xs font-bold text-stone-500">{String(label)}<Icon className="h-4 w-4 text-rose-400" /></div>
              <div className="mt-2 text-2xl font-black text-stone-900">{String(value)}</div>
            </div>
          ))}
        </div>
      </section>

      {!pos.openShift && (
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 md:flex-row md:items-center">
          <div><div className="font-bold text-amber-950">收款前請先開班</div><p className="mt-1 text-sm text-amber-800">有現金管理權限的人員可輸入開班零用金；系統會留下人員、時間與傳票。</p></div>
          <div className="flex items-center gap-2"><input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} type="number" className="h-11 w-36 rounded-xl border border-amber-200 bg-white px-3" /><button onClick={() => void openShift()} disabled={busy} className="h-11 rounded-xl bg-amber-900 px-5 text-sm font-bold text-white">開班</button></div>
        </section>
      )}

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2">
        {tabs.map(([value, label, Icon]) => <button key={value} onClick={() => setTab(value)} className={`inline-flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === value ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-50"}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>

      {tab === "schedule" && (
        <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-black text-stone-900">新增預約</h2>
            <div className="mt-4 grid gap-3">
              <select value={appointmentForm.customerId} onChange={(e) => setAppointmentForm({ ...appointmentForm, customerId: e.target.value })} className="h-11 rounded-xl border px-3">{medical.customers.map((item) => <option key={item.id} value={item.id}>{item.companyName}・{item.phone}</option>)}</select>
              <select value={appointmentForm.serviceId} onChange={(e) => setAppointmentForm({ ...appointmentForm, serviceId: e.target.value })} className="h-11 rounded-xl border px-3">{medical.services.map((item) => <option key={item.id} value={item.id}>{item.product.name}・{item.durationMinutes} 分</option>)}</select>
              <input type="datetime-local" value={appointmentForm.startAt} onChange={(e) => setAppointmentForm({ ...appointmentForm, startAt: e.target.value })} className="h-11 rounded-xl border px-3" />
              <div className="grid grid-cols-2 gap-3"><input value={appointmentForm.practitionerName} onChange={(e) => setAppointmentForm({ ...appointmentForm, practitionerName: e.target.value })} className="h-11 rounded-xl border px-3" placeholder="執行人員" /><input value={appointmentForm.room} onChange={(e) => setAppointmentForm({ ...appointmentForm, room: e.target.value })} className="h-11 rounded-xl border px-3" placeholder="診間" /></div>
              <button onClick={() => void createAppointment()} disabled={busy || !medical.customers.length} className="h-11 rounded-xl bg-rose-600 font-bold text-white disabled:opacity-40">建立預約</button>
            </div>
            <div className="mt-6 border-t pt-5"><h3 className="text-sm font-bold">快速新增就診人</h3><div className="mt-3 grid gap-2"><input value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="h-10 rounded-xl border px-3" placeholder="姓名" /><input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} className="h-10 rounded-xl border px-3" placeholder="電話" /><input value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} className="h-10 rounded-xl border px-3" placeholder="Email（選填）" /><button onClick={() => void createCustomer()} disabled={!newPatient.name || !newPatient.phone} className="h-10 rounded-xl border font-bold"><Plus className="mr-1 inline h-4 w-4" />新增</button></div></div>
          </section>
          <section className="space-y-3 rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-black text-stone-900">今日行程</h2>
            {medical.appointments.map((item) => {
              const matchingPurchases = medical.purchases.filter((purchase) => purchase.customerId === item.customer.id && purchase.package.serviceId === item.serviceId);
              return <article key={item.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-bold text-rose-500">{new Date(item.startAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}・{item.number}</div><div className="mt-1 font-black">{item.customer.companyName}｜{item.service.product.name}</div><div className="mt-1 text-xs text-stone-500">{item.practitionerName}・同意書 {item.consentStatus === "ACCEPTED" ? "已完成" : "待簽署"}</div></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{item.status}</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => void appointmentAction({ action: "STATUS", appointmentId: item.id, status: "CHECKED_IN" }, "已報到")} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">報到</button>
                  {item.consentStatus !== "ACCEPTED" && <button onClick={() => { const signedName = window.prompt("請輸入簽署姓名", item.customer.companyName); if (signedName) void appointmentAction({ action: "CONSENT", appointmentId: item.id, signedName }, "同意書已簽署"); }} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">簽同意書</button>}
                  {matchingPurchases.length > 0 && <select value={packageSelections[item.id] || ""} onChange={(e) => setPackageSelections({ ...packageSelections, [item.id]: e.target.value })} className="rounded-lg border bg-white px-2 text-xs"><option value="">本次不核銷套票</option>{matchingPurchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.package.name}（餘 {purchase.remainingSessions}）</option>)}</select>}
                  <button onClick={() => void appointmentAction({ action: "COMPLETE", appointmentId: item.id, packagePurchaseId: packageSelections[item.id] || null, treatmentNotes: "療程完成，狀況穩定。" }, "療程已完成，耗材與帳務已同步")} disabled={item.status === "COMPLETED"} className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><CheckCircle2 className="mr-1 inline h-4 w-4" />完成療程</button>
                </div>
              </article>;
            })}
            {!medical.appointments.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-stone-400">今天尚無預約</div>}
          </section>
        </div>
      )}

      {tab === "checkout" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((item) => <button key={item.id} onClick={() => setSelectedProductId(item.id)} className={`overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 ${selectedProductId === item.id ? "ring-2 ring-rose-400" : ""}`}><div className="relative h-40"><Image src={item.imageUrl || "/medical-aesthetics/skin-consultation.png"} alt={item.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 28vw" /></div><div className="p-4"><div className="text-xs font-bold text-rose-500">{item.kind}</div><div className="mt-1 font-black">{item.name}</div><div className="mt-2 text-lg font-black">{money(item.price)}</div></div></button>)}
          </section>
          <aside className="h-fit rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">醫療收據收款</h2><p className="mt-1 text-xs leading-5 text-stone-500">醫美模式不顯示電子發票；收據會分列醫療與非醫療費用。</p>
            <div className="mt-4 space-y-3"><select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-11 w-full rounded-xl border px-3">{medical.customers.map((item) => <option key={item.id} value={item.id}>{item.companyName}・儲值 {money(item.walletBalance)}</option>)}</select><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-11 w-full rounded-xl border px-3"><option value="CASH">現金</option><option value="CARD">信用卡</option><option value="MOBILE">行動支付</option><option value="TRANSFER">轉帳</option><option value="WALLET">會員儲值</option></select></div>
            <div className="my-5 border-y py-4"><div className="text-sm font-bold">{selectedProduct?.name || "尚未選擇"}</div><div className="mt-2 text-3xl font-black">{money(selectedProduct?.price || 0)}</div></div>
            <button onClick={() => void checkout()} disabled={busy || !pos.openShift || !selectedProduct || !selectedCustomer} className="h-12 w-full rounded-xl bg-rose-600 font-black text-white disabled:opacity-40">{busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "確認收款並開立醫療收據"}</button>
            <div className="mt-5 space-y-2"><div className="text-xs font-bold text-stone-500">最近收據</div>{medical.receipts.slice(0, 5).map((item) => <Link key={item.id} href={`/print/medical-receipt/${item.id}`} target="_blank" className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-xs"><span>{item.number}・{item.patientName}</span><span className="font-bold">{money(item.total)}</span></Link>)}</div>
          </aside>
        </div>
      )}

      {tab === "members" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-black">會員儲值</h2><p className="mt-1 text-sm text-stone-500">儲值先列預收款，使用儲值金付款時自動沖銷。</p><div className="mt-4 space-y-3"><select value={walletForm.customerId} onChange={(e) => setWalletForm({ ...walletForm, customerId: e.target.value })} className="h-11 w-full rounded-xl border px-3">{medical.customers.map((item) => <option key={item.id} value={item.id}>{item.companyName}・目前 {money(item.walletBalance)}</option>)}</select><input value={walletForm.amount} onChange={(e) => setWalletForm({ ...walletForm, amount: e.target.value })} type="number" className="h-11 w-full rounded-xl border px-3" /><select value={walletForm.paymentMethod} onChange={(e) => setWalletForm({ ...walletForm, paymentMethod: e.target.value })} className="h-11 w-full rounded-xl border px-3"><option value="CASH">現金</option><option value="CARD">信用卡</option><option value="MOBILE">行動支付</option><option value="TRANSFER">轉帳</option></select><button onClick={() => void topUp()} disabled={!walletForm.customerId || Number(walletForm.amount) <= 0} className="h-11 w-full rounded-xl bg-stone-900 font-bold text-white">確認儲值並列預收款</button></div></section>
          <section className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-black">有效療程套票</h2><div className="mt-4 space-y-3">{medical.purchases.map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><div className="font-bold">{item.customer.companyName}</div><div className="mt-1 text-sm text-stone-500">{item.package.name}</div></div><div className="text-right"><div className="text-2xl font-black text-rose-600">{item.remainingSessions}</div><div className="text-[10px] text-stone-400">剩餘堂數</div></div></div></div>)}{!medical.purchases.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-stone-400">尚無已購套票</div>}</div></section>
        </div>
      )}

      {tab === "records" && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">同意書、療程與收據稽核</h2><p className="mt-1 text-sm text-stone-500">保留簽署人、版本、術前術後紀錄、執行人員、耗材與帳務軌跡。</p></div><PackageCheck className="h-8 w-8 text-rose-400" /></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b text-xs text-stone-400"><tr><th className="p-3">收據號碼</th><th>就診人</th><th>開立時間</th><th>金額</th><th>狀態</th><th /></tr></thead><tbody>{medical.receipts.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-3 font-mono text-xs">{item.number}</td><td>{item.patientName}</td><td>{new Date(item.issuedAt).toLocaleString("zh-TW")}</td><td className="font-bold">{money(item.total)}</td><td>{item.status}</td><td><Link href={`/print/medical-receipt/${item.id}`} target="_blank" className="font-bold text-rose-600">列印</Link></td></tr>)}</tbody></table></div>
        </section>
      )}
    </div>
  );
}
