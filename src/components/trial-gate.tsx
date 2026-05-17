"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { ShieldCheck, CreditCard, Clock, CheckCircle2, Lock, CalendarClock, Wrench } from "lucide-react";

const PAYPAL_ONCE_URL = "https://www.paypal.com/ncp/payment/THPBQKV5SY3WN";
const PAYPAL_MONTHLY_URL = "https://www.paypal.com/ncp/payment/GV6PKA6RLC4H8";
const PAYPAL_MODIFY_URL = "https://www.paypal.com/ncp/payment/TWZCMWYCVKBNE";

type GateState = "loading" | "trial" | "expired" | "paid" | "locked";

export function TrialGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [remainMs, setRemainMs] = useState(0);
  const [subRemainMs, setSubRemainMs] = useState(0);
  const expireAtRef = useRef<number>(0);
  const subEndRef = useRef<number>(0);

  const checkTrial = useCallback(async () => {
    try {
      const res = await fetch("/api/trial");
      const data = await res.json();
      if (data.status === "paid") {
        setState("paid");
        if (data.paymentType === "MONTHLY" && data.subscriptionRemainMs) {
          subEndRef.current = Date.now() + data.subscriptionRemainMs;
          setSubRemainMs(data.subscriptionRemainMs);
        }
      } else if (data.status === "locked") {
        setState("locked");
      } else if (data.status === "expired") {
        setState("expired");
      } else {
        const remain = data.remainMs ?? 0;
        expireAtRef.current = Date.now() + remain;
        setRemainMs(remain);
        setState("trial");
      }
    } catch {
      setState("trial");
    }
  }, []);

  useEffect(() => {
    checkTrial();
    const serverInterval = setInterval(checkTrial, 5 * 60_000);
    const tickInterval = setInterval(() => {
      if (expireAtRef.current > 0) {
        const remaining = expireAtRef.current - Date.now();
        if (remaining <= 0) setState("expired");
        else setRemainMs(remaining);
      }
      if (subEndRef.current > 0) {
        const remaining = subEndRef.current - Date.now();
        if (remaining <= 0) { subEndRef.current = 0; checkTrial(); }
        else setSubRemainMs(remaining);
      }
    }, 1000);
    return () => { clearInterval(serverInterval); clearInterval(tickInterval); };
  }, [checkTrial]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (state === "locked") return <LockedScreen />;

  if (state === "paid") {
    return (
      <>
        {subRemainMs > 0 && <SubscriptionBanner remainMs={subRemainMs} />}
        {children}
      </>
    );
  }

  if (state === "trial") {
    const hours = Math.floor(remainMs / (1000 * 60 * 60));
    const mins = Math.floor((remainMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((remainMs % (1000 * 60)) / 1000);
    return (
      <>
        <TrialBanner hours={hours} mins={mins} secs={secs} />
        {children}
      </>
    );
  }

  return <Paywall />;
}

/* ─── 試用期倒數 banner ─── */
function TrialBanner({ hours, mins, secs }: { hours: number; mins: number; secs: number }) {
  return (
    <div className="sticky top-0 z-[999] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg print:hidden">
      <Clock className="h-4 w-4 shrink-0" />
      <span>試用期剩餘：{hours} 小時 {mins} 分 {secs} 秒</span>
      <a href={PAYPAL_ONCE_URL} target="_blank" rel="noopener noreferrer" className="ml-3 inline-flex items-center gap-1 bg-white text-orange-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-orange-50 transition">
        <CreditCard className="h-3 w-3" />一次性永久購買
      </a>
      <a href={PAYPAL_MONTHLY_URL} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 bg-white text-indigo-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-indigo-50 transition">
        <CalendarClock className="h-3 w-3" />月付訂閱
      </a>
      <a href={PAYPAL_MODIFY_URL} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 bg-white text-emerald-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-emerald-50 transition">
        <Wrench className="h-3 w-3" />一次修改
      </a>
    </div>
  );
}

/* ─── 月付訂閱有效 banner ─── */
function SubscriptionBanner({ remainMs }: { remainMs: number }) {
  const days = Math.floor(remainMs / (1000 * 60 * 60 * 24));
  if (days > 7) return null;
  return (
    <div className="sticky top-0 z-[999] bg-gradient-to-r from-indigo-500 to-blue-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg print:hidden">
      <CalendarClock className="h-4 w-4 shrink-0" />
      <span>月付訂閱將在 {days} 天後到期</span>
      <a href={PAYPAL_MONTHLY_URL} target="_blank" rel="noopener noreferrer" className="ml-3 inline-flex items-center gap-1 bg-white text-indigo-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-indigo-50 transition">
        <CreditCard className="h-3 w-3" />續費
      </a>
    </div>
  );
}

/* ─── 試用到期 paywall ─── */
function Paywall() {
  const [checking, setChecking] = useState(false);

  async function handleCheckPayment() {
    setChecking(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch("/api/trial");
        const data = await res.json();
        if (data.status === "paid") { clearInterval(interval); window.location.reload(); }
      } catch {}
      if (attempts >= 60) { clearInterval(interval); setChecking(false); }
    }, 5000);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-purple-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="relative max-w-lg w-full">
        {checking ? (
          <div className="text-center space-y-6 animate-in fade-in">
            <div className="mx-auto h-20 w-20 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <Clock className="h-10 w-10 text-indigo-400 animate-spin" style={{ animationDuration: "3s" }} />
            </div>
            <h2 className="text-2xl font-bold text-white">等待付款確認中…</h2>
            <p className="text-slate-400 text-sm">PayPal 付款完成後系統會自動偵測並啟用<br />請勿關閉此頁面</p>
            <p className="text-xs text-slate-500">通常 1～2 分鐘內完成，若超過 5 分鐘請聯繫管理員</p>
            <p className="text-xs text-slate-500">
              <a href="mailto:erin20080306@gmail.com" className="text-indigo-400 hover:underline">erin20080306@gmail.com</a>
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/40">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mt-4">試用期已結束</h2>
              <p className="text-slate-400 text-sm">您的免費試用已到期，請選擇付款方案繼續使用。</p>
            </div>

            {/* 一次性永久 */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 text-sm">ERP 進銷存會計管理系統</span>
                <span className="text-white font-bold">一次性永久授權</span>
              </div>
              <a href={PAYPAL_ONCE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(handleCheckPayment, 2000)}
                className="flex items-center justify-center gap-2 w-full h-12 bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold rounded-xl transition shadow-lg shadow-blue-500/30">
                <CreditCard className="h-5 w-5" />PayPal 單次付款（永久使用）
              </a>
            </div>

            {/* 月付訂閱 */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 text-sm">月付訂閱方案</span>
                <span className="text-white font-bold">每月續費</span>
              </div>
              <p className="text-xs text-slate-400">每月付款一次，到期未續費帳號將被鎖定。</p>
              <a href={PAYPAL_MONTHLY_URL} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(handleCheckPayment, 2000)}
                className="flex items-center justify-center gap-2 w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition shadow-lg shadow-purple-500/30">
                <CalendarClock className="h-5 w-5" />PayPal 月付訂閱
              </a>
            </div>

            {/* 一次修改 */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 text-sm">單次修改服務</span>
                <span className="text-white font-bold">一次修改</span>
              </div>
              <a href={PAYPAL_MODIFY_URL} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(handleCheckPayment, 2000)}
                className="flex items-center justify-center gap-2 w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl transition shadow-lg shadow-emerald-500/30">
                <Wrench className="h-5 w-5" />PayPal 一次修改付款
              </a>
            </div>

            <button onClick={handleCheckPayment} className="w-full h-10 text-sm text-slate-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl transition">
              我已完成付款，等待系統確認
            </button>

            <p className="text-xs text-slate-500 text-center">付款完成後系統會透過 PayPal 自動驗證，無需手動操作</p>
            <p className="text-xs text-slate-500 text-center">
              有後續問題請聯繫：<a href="mailto:erin20080306@gmail.com" className="text-indigo-400 hover:underline">erin20080306@gmail.com</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 帳號已鎖定 ─── */
function LockedScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 flex items-center justify-center p-4">
      <div className="relative max-w-md w-full rounded-2xl bg-white/5 backdrop-blur-2xl border border-red-500/50 shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg shadow-red-500/40">
            <Lock className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mt-4">帳號已鎖定</h2>
          <p className="text-slate-400 text-sm">您的月付訂閱已到期，帳號及所有相關使用者已被鎖定。</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center text-sm text-red-300">
          所有在此帳號下建立的使用者皆無法登入，直到完成付款為止。
        </div>
        <a href={PAYPAL_ONCE_URL} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-12 bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold rounded-xl transition shadow-lg shadow-blue-500/30">
          <CreditCard className="h-5 w-5" />付款解鎖（一次性永久）
        </a>
        <a href={PAYPAL_MONTHLY_URL} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-11 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition">
          <CalendarClock className="h-5 w-5" />付款解鎖（月付訂閱）
        </a>
        <p className="text-xs text-slate-500 text-center">
          付款後請聯繫管理員解鎖帳號：<a href="mailto:erin20080306@gmail.com" className="text-indigo-400 hover:underline">erin20080306@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
