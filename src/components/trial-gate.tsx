"use client";
import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, CreditCard, Clock, CheckCircle2 } from "lucide-react";

const PAYPAL_URL = "https://www.paypal.com/ncp/payment/THPBQKV5SY3WN";

type GateState = "loading" | "trial" | "expired" | "paid";

export function TrialGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [remainMs, setRemainMs] = useState(0);

  const checkTrial = useCallback(async () => {
    try {
      const res = await fetch("/api/trial");
      const data = await res.json();
      if (data.status === "paid") {
        setState("paid");
      } else if (data.status === "expired") {
        setState("expired");
      } else {
        setRemainMs(data.remainMs ?? 0);
        setState("trial");
      }
    } catch {
      setState("trial");
    }
  }, []);

  useEffect(() => {
    checkTrial();
    const interval = setInterval(checkTrial, 60_000);
    return () => clearInterval(interval);
  }, [checkTrial]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (state === "paid") {
    return (
      <>
        <PaidBadge />
        {children}
      </>
    );
  }

  if (state === "trial") {
    const hours = Math.floor(remainMs / (1000 * 60 * 60));
    const mins = Math.floor((remainMs % (1000 * 60 * 60)) / (1000 * 60));
    return (
      <>
        <TrialBanner hours={hours} mins={mins} />
        {children}
      </>
    );
  }

  return <Paywall />;
}

/* ─── 試用期倒數 banner ─── */
function TrialBanner({ hours, mins }: { hours: number; mins: number }) {
  return (
    <div className="sticky top-0 z-[999] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg print:hidden">
      <Clock className="h-4 w-4 shrink-0" />
      <span>試用期剩餘：{hours} 小時 {mins} 分鐘</span>
      <a
        href={PAYPAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-3 inline-flex items-center gap-1 bg-white text-orange-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-orange-50 transition"
      >
        <CreditCard className="h-3 w-3" />
        立即購買永久授權
      </a>
    </div>
  );
}

/* ─── 試用到期 paywall ─── */
function Paywall() {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirmPaid() {
    setConfirming(true);
    await fetch("/api/trial/activate", { method: "POST" });
    setTimeout(() => window.location.reload(), 1500);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-purple-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="relative max-w-md w-full">
        {confirming ? (
          <div className="text-center space-y-6 animate-in fade-in">
            <div className="mx-auto h-20 w-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">🎉 你已獲得永久使用權</h2>
            <p className="text-slate-400">正在為您載入系統…</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/40">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mt-4">試用期已結束</h2>
              <p className="text-slate-400 text-sm">您的 2 天免費試用已到期，請付款以獲得永久使用權。</p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 text-sm">ERP 進銷存會計管理系統</span>
                <span className="text-white font-bold">永久授權</span>
              </div>
            </div>

            <a
              href={PAYPAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-12 bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold rounded-xl transition shadow-lg shadow-blue-500/30"
            >
              <CreditCard className="h-5 w-5" />
              使用 PayPal 付款
            </a>

            <button
              onClick={handleConfirmPaid}
              className="w-full h-10 text-sm text-slate-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl transition"
            >
              我已完成付款，點此啟用
            </button>

            <p className="text-xs text-slate-500 text-center">
              付款完成後點擊上方按鈕即可永久使用本系統
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 已付款小徽章 ─── */
function PaidBadge() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[999] animate-in slide-in-from-bottom fade-in bg-emerald-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium print:hidden">
      <CheckCircle2 className="h-4 w-4" />
      你已獲得永久使用權
    </div>
  );
}
