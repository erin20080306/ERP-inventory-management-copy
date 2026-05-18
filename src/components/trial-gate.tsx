"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { signOut } from "next-auth/react";
import { ShieldCheck, CreditCard, Clock, CheckCircle2, Lock, CalendarClock, Wrench, LogOut, X, Send } from "lucide-react";

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
  const [showInfoPage, setShowInfoPage] = useState(true);

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

  if (showInfoPage) {
    return <InfoPage onClose={() => setShowInfoPage(false)} />;
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
            <button onClick={() => { setChecking(false); }} className="mt-4 px-6 py-2 text-sm text-slate-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl transition">
              <X className="h-4 w-4 inline mr-1" />關閉此畫面
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8 space-y-6">
            {/* 登出按鈕 */}
            <div className="flex justify-end">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition"
              >
                <LogOut className="h-3 w-3" />登出
              </button>
            </div>

            <div className="text-center space-y-2">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/40">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mt-4">試用已結束</h2>
              <p className="text-slate-400 text-sm">若你覺得系統適合，可選擇：</p>
            </div>

            {/* 付款方案說明 */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-2 text-sm text-slate-300">
              <p><span className="font-bold text-white">月租 600 元</span>，修改一次 1000 元</p>
              <p><span className="font-bold text-white">一次買斷 5000 元</span>，送一次基本修改</p>
            </div>

            {/* 付款按鈕 */}
            <a href={PAYPAL_ONCE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(handleCheckPayment, 2000)}
              className="flex items-center justify-center gap-2 w-full h-12 bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold rounded-xl transition shadow-lg shadow-blue-500/30">
              <CreditCard className="h-5 w-5" />PayPal 單次付款（永久使用）
            </a>

            <a href={PAYPAL_MONTHLY_URL} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(handleCheckPayment, 2000)}
              className="flex items-center justify-center gap-2 w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition shadow-lg shadow-purple-500/30">
              <CalendarClock className="h-5 w-5" />PayPal 月付訂閱
            </a>

            <button onClick={handleCheckPayment} className="w-full h-10 text-sm text-slate-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl transition">
              我已完成付款，等待系統確認
            </button>

            {/* 了解更多 / 諮詢 */}
            <button onClick={() => setShowInfoPage(true)} className="w-full h-10 text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 rounded-xl transition">
              了解更多服務內容 / 填寫諮詢表單
            </button>

            <p className="text-xs text-slate-500 text-center">付款完成後系統會透過 PayPal 自動驗證，無需手動操作</p>

            {/* 服務人員資訊 */}
            <div className="border-t border-white/10 pt-4 text-xs text-slate-500 space-y-1">
              <div className="font-medium text-slate-400">艾琳設計</div>
              <div>Email: erin20080306@gmail.com</div>
              <div>Line ID: erin2008</div>
              <a href="https://erin20080306.wixsite.com/designed-by-erin" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition">
                網站：https://erin20080306.wixsite.com/designed-by-erin
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 服務詳情 + 諮詢表單頁 ─── */
function InfoPage({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    lineId: "",
    platform: "蝦皮",
    dataFormat: "Excel",
    problem: "想管理庫存",
    plan: "還不確定",
    notes: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setSent(true);
      } else {
        alert(`送出失敗：${data.error || "未知錯誤"}`);
      }
    } catch (err: any) {
      alert(`送出失敗：${err.message || "網路錯誤"}`);
    }
    setSending(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        {/* 關閉按鈕 */}
        <button onClick={onClose} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition mb-4">
          <X className="h-4 w-4" />關閉此畫面
        </button>

        <div className="rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl p-8 space-y-6">
          <h2 className="text-2xl font-bold text-white text-center">試用已結束</h2>

          <div className="text-sm text-slate-300 space-y-3">
            <p>若你覺得系統適合，可選擇：</p>
            <ul className="space-y-2 pl-4">
              <li><span className="font-bold text-white">月租 600 元</span>，修改一次 1000 元</li>
              <li><span className="font-bold text-white">一次買斷 5000 元</span>，送一次基本修改</li>
            </ul>
          </div>

          <div className="text-sm text-slate-300 space-y-3">
            <p className="font-bold text-white">支援 Excel / CSV 資料整理。</p>
            <p>只要你的電商後台能匯出 Excel 或 CSV，我可以協助判斷是否能轉成進銷存資料。</p>
          </div>

          <div className="text-sm text-slate-300 space-y-3">
            <p className="font-bold text-white">可協助處理：</p>
            <p>商品、庫存、進貨、銷貨、會計、權限、備份、標示、客製欄位、商品圖片圖示、電商後台帳務。</p>
          </div>

          <div className="text-sm text-slate-300 space-y-3">
            <p className="font-bold text-white">適合：</p>
            <p>蝦皮、PChome、momo、Coupang 等電商賣家，以及小型企業、小商家帳務與收款管理。</p>
          </div>

          <div className="text-sm text-slate-300 space-y-3">
            <p>不用昂貴 ERP，也能管理進銷存與會計。</p>
            <p>商品出貨可自動轉傳票。</p>
            <p>可製作資產負債表、損益表、客製化損益報表、動態圖表，也可串接 Google Sheet。</p>
          </div>

          <div className="border-t border-white/10 pt-6">
            <p className="text-sm text-slate-300 mb-4">不確定怎麼開始，可以在下方填寫你的問題。<br />請簡單描述你的需求，例如：使用哪個電商平台、目前用 Excel 還是後台匯出 CSV、想管理庫存、帳務、出貨、報表或客製欄位。</p>
            <p className="text-xs text-slate-400 mb-6">送出後我會收到信件，並協助你判斷適合月租、買斷，還是需要客製。</p>

            {sent ? (
              <div className="text-center space-y-4 py-8">
                <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
                <p className="text-white font-bold">已送出！</p>
                <p className="text-slate-400 text-sm">我會盡快回覆您，謝謝。</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">姓名／稱呼</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full h-10 px-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Email</label>
                  <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full h-10 px-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Line ID</label>
                  <input type="text" value={form.lineId} onChange={(e) => setForm({ ...form, lineId: e.target.value })}
                    className="w-full h-10 px-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">使用平台</label>
                  <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    className="w-full h-10 px-4 bg-white/5 border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-400">
                    <option value="蝦皮" className="bg-slate-900">蝦皮</option>
                    <option value="PChome" className="bg-slate-900">PChome</option>
                    <option value="momo" className="bg-slate-900">momo</option>
                    <option value="Coupang" className="bg-slate-900">Coupang</option>
                    <option value="其他" className="bg-slate-900">其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">目前資料格式</label>
                  <select value={form.dataFormat} onChange={(e) => setForm({ ...form, dataFormat: e.target.value })}
                    className="w-full h-10 px-4 bg-white/5 border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-400">
                    <option value="Excel" className="bg-slate-900">Excel</option>
                    <option value="CSV" className="bg-slate-900">CSV</option>
                    <option value="手動記帳" className="bg-slate-900">手動記帳</option>
                    <option value="其他" className="bg-slate-900">其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">想解決的問題／客製需求</label>
                  <select value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })}
                    className="w-full h-10 px-4 bg-white/5 border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-400">
                    <option value="想管理庫存" className="bg-slate-900">想管理庫存</option>
                    <option value="想管理帳務" className="bg-slate-900">想管理帳務</option>
                    <option value="想管理出貨" className="bg-slate-900">想管理出貨</option>
                    <option value="想製作報表" className="bg-slate-900">想製作報表</option>
                    <option value="客製欄位" className="bg-slate-900">客製欄位</option>
                    <option value="電商後台帳務整合" className="bg-slate-900">電商後台帳務整合</option>
                    <option value="其他" className="bg-slate-900">其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">想選方案</label>
                  <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}
                    className="w-full h-10 px-4 bg-white/5 border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-400">
                    <option value="月租" className="bg-slate-900">月租</option>
                    <option value="買斷" className="bg-slate-900">買斷</option>
                    <option value="還不確定" className="bg-slate-900">還不確定</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">備註（可空白）</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                    className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                </div>
                <button type="submit" disabled={sending}
                  className="flex items-center justify-center gap-2 w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
                  <Send className="h-4 w-4" />{sending ? "送出中..." : "送出諮詢"}
                </button>
              </form>
            )}
          </div>

          {/* 服務人員資訊 */}
          <div className="border-t border-white/10 pt-4 text-sm text-slate-400 space-y-1 text-center">
            <div className="font-bold text-white">艾琳設計</div>
            <div>Email: erin20080306@gmail.com</div>
            <div>Line ID: erin2008</div>
            <a href="https://erin20080306.wixsite.com/designed-by-erin" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition block">
              https://erin20080306.wixsite.com/designed-by-erin
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 帳號已鎖定 ─── */
function LockedScreen() {
  const [showFreeUse, setShowFreeUse] = useState(false);
  const [freePassword, setFreePassword] = useState("");
  const [freeError, setFreeError] = useState("");
  const [freeLoading, setFreeLoading] = useState(false);

  async function handleFreeUse() {
    setFreeError("");
    setFreeLoading(true);
    try {
      const res = await fetch("/api/trial/free-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: freePassword }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.reload();
      } else {
        setFreeError(data.error || "密碼錯誤");
      }
    } catch {
      setFreeError("系統錯誤，請稍後再試");
    }
    setFreeLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 flex items-center justify-center p-4">
      <div className="relative max-w-md w-full rounded-2xl bg-white/5 backdrop-blur-2xl border border-red-500/50 shadow-2xl p-8 space-y-6">
        {/* 登出按鈕 */}
        <div className="flex justify-end">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition"
          >
            <LogOut className="h-3 w-3" />登出
          </button>
        </div>
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

        {/* 不用付款使用（需密碼） */}
        <div className="border-t border-white/10 pt-4 space-y-3">
          {!showFreeUse ? (
            <button onClick={() => setShowFreeUse(true)} className="w-full h-10 text-sm text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/50 rounded-xl transition">
              不用付款使用（需輸入超級管理員密碼）
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="password"
                placeholder="請輸入超級管理員密碼"
                value={freePassword}
                onChange={(e) => setFreePassword(e.target.value)}
                className="w-full h-10 px-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-amber-400"
              />
              {freeError && <p className="text-xs text-red-400">{freeError}</p>}
              <button
                onClick={handleFreeUse}
                disabled={freeLoading || !freePassword}
                className="w-full h-10 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-xl transition"
              >
                {freeLoading ? "驗證中..." : "確認啟用"}
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 text-center">
          付款後請聯繫管理員解鎖帳號：<a href="mailto:erin20080306@gmail.com" className="text-indigo-400 hover:underline">erin20080306@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
