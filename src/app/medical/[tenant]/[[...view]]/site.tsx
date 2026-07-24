"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, HeartPulse, Loader2, Menu, ShieldCheck, Sparkles, X } from "lucide-react";

type Service = {
  id: string;
  code: string;
  category: string;
  durationMinutes: number;
  consentRequired: boolean;
  product: { name: string; salePrice: number; imageUrl: string | null };
};
type SiteData = {
  demo: boolean;
  clinic: { name: string; address?: string | null; phone?: string | null; email?: string | null };
  services: Service[];
};

function money(value: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
}

export function MedicalClinicSite({ tenant, managerAccess, managerErpHref }: { tenant: string; managerAccess: boolean; managerErpHref: string }) {
  const [data, setData] = useState<SiteData | null>(null);
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState<Service | null>(null);
  const [booking, setBooking] = useState({ name: "", phone: "", email: "", startAt: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/medical-site/${encodeURIComponent(tenant)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "網站載入失敗");
        return result;
      })
      .then((result) => setData(result))
      .catch((error) => setMessage(error.message));
  }, [tenant]);

  const minimumBooking = useMemo(() => {
    const date = new Date(Date.now() + 60 * 60_000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }, []);

  async function submitBooking() {
    if (!selected || !booking.name || !booking.phone || !booking.startAt) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/medical-site/${encodeURIComponent(tenant)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...booking, serviceId: selected.id, startAt: new Date(booking.startAt).toISOString() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "預約失敗");
      setMessage(`預約已送出，預約編號 ${result.number}。診所將與您確認時段。`);
      setBooking({ name: "", phone: "", email: "", startAt: "", notes: "" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "預約失敗");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <main className="flex min-h-screen items-center justify-center bg-[#f7f2ee] text-sm text-stone-500">{message || <><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在開啟診所官網…</>}</main>;

  return (
    <main className="min-h-screen bg-[#f8f5f1] text-[#24201e]">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[#f8f5f1]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
          <a href="#top" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ad7f7b] text-white"><HeartPulse className="h-5 w-5" /></span><span><b className="block text-sm tracking-[.12em]">{data.clinic.name}</b><small className="text-[10px] uppercase tracking-[.3em] text-stone-400">Aesthetic Medicine</small></span></a>
          <nav className="hidden items-center gap-7 text-sm font-semibold md:flex"><a href="#philosophy">理念</a><a href="#services">服務項目</a><a href="#process">安心流程</a><a href="#booking">線上預約</a>{managerAccess && <Link href={managerErpHref} className="rounded-full bg-stone-900 px-5 py-2.5 text-white">進入 ERP</Link>}</nav>
          <button onClick={() => setMenu(!menu)} className="md:hidden">{menu ? <X /> : <Menu />}</button>
        </div>
        {menu && <nav className="space-y-3 border-t bg-white p-5 text-sm font-bold md:hidden"><a href="#services" className="block" onClick={() => setMenu(false)}>服務項目</a><a href="#booking" className="block" onClick={() => setMenu(false)}>線上預約</a>{managerAccess && <Link href={managerErpHref} className="block text-rose-700">進入 ERP</Link>}</nav>}
      </header>

      <section id="top" className="relative min-h-[720px] overflow-hidden">
        <Image src="/medical-aesthetics/clinic-hero.png" alt="自然光與柔和色調的專業醫美診所空間" fill priority className="object-cover object-center" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#f8f5f1] via-[#f8f5f1]/80 to-transparent" />
        <div className="relative mx-auto flex min-h-[720px] max-w-7xl items-center px-5 py-24">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#c59d98]/40 bg-white/60 px-4 py-2 text-xs font-bold tracking-[.18em] text-[#9b6966]"><Sparkles className="h-4 w-4" />細緻評估・充分溝通・安心紀錄</div>
            <h1 className="mt-7 text-5xl font-black leading-[1.1] tracking-tight md:text-7xl">讓美，從理解<br />自己開始。</h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-stone-600">以專業諮詢與個人化規劃陪伴每一次選擇。所有療程先完成評估與知情同意，實際適用性與效果由醫事人員說明。</p>
            <div className="mt-9 flex flex-wrap gap-3"><a href="#services" className="inline-flex items-center gap-2 rounded-full bg-[#a97571] px-6 py-3.5 font-bold text-white">瀏覽服務 <ArrowRight className="h-4 w-4" /></a><a href="#booking" className="rounded-full border border-stone-300 bg-white/70 px-6 py-3.5 font-bold">預約專業諮詢</a></div>
          </div>
        </div>
      </section>

      <section id="philosophy" className="mx-auto grid max-w-7xl gap-10 px-5 py-24 lg:grid-cols-3">
        {[["專業評估", "由適格醫事人員依個別狀況說明選項、限制與注意事項。", ShieldCheck], ["透明溝通", "服務內容、時間與自費金額在預約及收據中清楚呈現。", CheckCircle2], ["完整紀錄", "同意書、療程紀錄與耗材追蹤，讓每次服務可查可稽核。", CalendarDays]].map(([title, description, Icon]) => <div key={String(title)} className="border-t border-stone-300 pt-6"><Icon className="h-6 w-6 text-[#ad7f7b]" /><h2 className="mt-5 text-xl font-black">{String(title)}</h2><p className="mt-3 text-sm leading-7 text-stone-500">{String(description)}</p></div>)}
      </section>

      <section id="services" className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-5"><div className="max-w-2xl"><div className="text-xs font-bold uppercase tracking-[.25em] text-[#a97571]">Selected Services</div><h2 className="mt-3 text-4xl font-black">選擇適合您的服務</h2><p className="mt-4 leading-7 text-stone-500">先從感興趣的服務開始，預約後由專業人員進一步評估；圖片為空間與服務情境示意。</p></div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">{data.services.map((service) => <article key={service.id} className="group overflow-hidden rounded-[28px] border border-stone-100 bg-[#fbfaf8] shadow-sm"><div className="relative h-64 overflow-hidden"><Image src={service.product.imageUrl || "/medical-aesthetics/skin-consultation.png"} alt={`${service.product.name}服務情境`} fill className="object-cover transition duration-500 group-hover:scale-105" sizes="(max-width: 768px) 100vw, 25vw" /></div><div className="p-5"><div className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a97571]">{service.category}</div><h3 className="mt-2 text-lg font-black">{service.product.name}</h3><div className="mt-3 flex items-center justify-between text-xs text-stone-500"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />約 {service.durationMinutes} 分</span><b className="text-base text-stone-900">{money(Number(service.product.salePrice))}</b></div><button onClick={() => { setSelected(service); document.querySelector("#booking")?.scrollIntoView({ behavior: "smooth" }); }} className="mt-5 w-full rounded-full border border-stone-300 py-2.5 text-sm font-bold transition hover:bg-stone-900 hover:text-white">選擇並預約</button></div></article>)}</div>
        </div>
      </section>

      <section id="process" className="mx-auto max-w-7xl px-5 py-24"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><div className="text-xs font-bold uppercase tracking-[.25em] text-[#a97571]">Safe Journey</div><h2 className="mt-3 text-4xl font-black">安心，不只是一句話</h2></div><div className="grid gap-px overflow-hidden rounded-3xl border bg-stone-200 sm:grid-cols-2">{[["01", "線上選服務", "查看圖片、時間與自費價格"], ["02", "預約與評估", "確認需求、適用性與執行人員"], ["03", "知情同意", "簽署服務說明與個別注意事項"], ["04", "完成與追蹤", "留下療程及術前術後紀錄"]].map(([number, title, description]) => <div key={number} className="bg-[#f8f5f1] p-7"><div className="text-xs font-black text-[#a97571]">{number}</div><h3 className="mt-5 font-black">{title}</h3><p className="mt-2 text-sm text-stone-500">{description}</p></div>)}</div></div></section>

      <section id="booking" className="bg-[#272220] py-24 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[.8fr_1.2fr]">
          <div><div className="text-xs font-bold uppercase tracking-[.25em] text-[#d6aaa5]">Appointment</div><h2 className="mt-4 text-4xl font-black">預約一段專屬時間</h2><p className="mt-5 max-w-md text-sm leading-7 text-stone-300">送出後診所將再確認預約。此表單不取代醫療診斷；如有急性不適，請尋求合適的即時醫療協助。</p>{data.clinic.address && <p className="mt-8 text-sm text-stone-400">{data.clinic.address}<br />{data.clinic.phone}</p>}</div>
          <div className="rounded-[30px] bg-white p-6 text-stone-900 md:p-8"><div className="mb-5"><div className="text-xs font-bold text-stone-400">您選擇的服務</div><div className="mt-1 text-xl font-black">{selected?.product.name || "請先選擇服務項目"}</div></div><div className="grid gap-4 sm:grid-cols-2"><input value={booking.name} onChange={(e) => setBooking({ ...booking, name: e.target.value })} placeholder="姓名" className="h-12 rounded-xl border px-4" /><input value={booking.phone} onChange={(e) => setBooking({ ...booking, phone: e.target.value })} placeholder="聯絡電話" className="h-12 rounded-xl border px-4" /><input value={booking.email} onChange={(e) => setBooking({ ...booking, email: e.target.value })} placeholder="Email（選填）" className="h-12 rounded-xl border px-4" /><input type="datetime-local" min={minimumBooking} value={booking.startAt} onChange={(e) => setBooking({ ...booking, startAt: e.target.value })} className="h-12 rounded-xl border px-4" /><textarea value={booking.notes} onChange={(e) => setBooking({ ...booking, notes: e.target.value })} placeholder="想先讓我們知道的需求（選填）" className="min-h-28 rounded-xl border p-4 sm:col-span-2" /></div>{message && <div className={`mt-4 rounded-xl p-3 text-sm ${message.includes("已送出") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{message}</div>}<button onClick={() => void submitBooking()} disabled={!selected || !booking.name || !booking.phone || !booking.startAt || busy} className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-[#a97571] font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "送出預約需求"}</button></div>
        </div>
      </section>

      <footer className="border-t bg-[#272220] px-5 py-8 text-center text-xs leading-6 text-stone-500">© 2026 {data.clinic.name}・本網站資訊僅供服務介紹，實際療程須由醫事人員完成評估與說明。</footer>
    </main>
  );
}
