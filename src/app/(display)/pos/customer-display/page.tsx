"use client";

import { useEffect, useState } from "react";

const EMPTY = { items: [] as Array<{ name: string; quantity: number; amount: number }>, total: 0, paid: 0, change: 0, message: "歡迎光臨" };

function money(value: number) {
  return `NT$ ${Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}`;
}

export default function PosCustomerDisplayPage() {
  const [display, setDisplay] = useState(EMPTY);
  const [connected, setConnected] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);
  useEffect(() => {
    setDesktopMode(new URLSearchParams(window.location.search).get("desktop") === "1");
    const channel = new BroadcastChannel("erin-pos-customer-display");
    channel.onmessage = (event) => {
      if (!event.data || event.data.version !== 1) return;
      setDisplay(event.data);
      setConnected(true);
    };
    return () => channel.close();
  }, []);
  return (
    <main className="fixed inset-0 overflow-hidden bg-slate-950 text-white p-8 flex flex-col">
      <header className="flex items-center justify-between border-b border-white/15 pb-5"><div><div className="text-3xl font-black">艾琳門市</div><div className="text-sm text-white/50 mt-1">Customer Display · {desktopMode ? "桌面第二螢幕" : "瀏覽器模擬模式"}</div></div><div className={`rounded-full px-4 py-2 text-sm ${connected ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>{connected ? "已收到 POS 訊號" : "等待 POS 訊號"}</div></header>
      <section className="flex-1 grid grid-cols-[1fr_360px] gap-10 py-8 min-h-0"><div className="overflow-y-auto"><div className="text-white/50 text-sm mb-4">本筆商品</div>{display.items.length === 0 ? <div className="h-full flex items-center justify-center text-3xl text-white/30">請開始掃描商品</div> : <div className="space-y-3">{display.items.map((item, index) => <div key={`${item.name}-${index}`} className="rounded-2xl bg-white/5 p-5 flex items-center justify-between"><div><div className="text-xl font-semibold">{item.name}</div><div className="text-white/50 mt-1">數量 {item.quantity}</div></div><div className="text-2xl font-bold">{money(item.amount)}</div></div>)}</div>}</div><aside className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-700 p-7 flex flex-col justify-between shadow-2xl"><div><div className="text-white/75">應付總額</div><div className="text-5xl font-black mt-3">{money(display.total)}</div></div><div className="space-y-3 text-lg"><div className="flex justify-between"><span>已收</span><strong>{money(display.paid)}</strong></div><div className="flex justify-between border-t border-white/25 pt-3"><span>找零</span><strong className="text-3xl">{money(display.change)}</strong></div></div></aside></section>
      <footer className="rounded-2xl bg-white/5 px-6 py-4 text-center text-xl">{display.message}</footer>
    </main>
  );
}
