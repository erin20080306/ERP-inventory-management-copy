"use client";

import { useEffect, useRef, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Toaster, toast } from "sonner";

function CheckoutFeedback() {
  const [state, setState] = useState<"processing" | "success" | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch;
    const wrappedFetch: typeof window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1];
      const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      let isCheckout = false;
      try {
        isCheckout = method === "POST" && new URL(rawUrl, window.location.origin).pathname === "/api/pos/checkout";
      } catch {
        isCheckout = false;
      }
      if (!isCheckout) return await originalFetch(...args);

      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setState("processing");
      const toastId = toast.loading("結帳處理中，請勿重複點擊或再次收款", { duration: Infinity });
      try {
        const response = await originalFetch(...args);
        if (response.ok) {
          setState("success");
          toast.success("結帳完成，庫存、付款與帳務已寫入", { id: toastId, duration: 6000 });
          hideTimerRef.current = window.setTimeout(() => setState(null), 2600);
        } else {
          setState(null);
          toast.error("結帳未完成，請查看畫面上的錯誤訊息", { id: toastId, duration: 6000 });
        }
        return response;
      } catch (error) {
        setState(null);
        toast.error("結帳連線中斷，請勿再次收款；請依原購物車重新確認交易結果", { id: toastId, duration: 8000 });
        throw error;
      }
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!state) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-5 backdrop-blur-[2px]" role="status" aria-live="assertive" aria-label={state === "processing" ? "結帳處理中" : "結帳完成"}>
      <div className={`w-full max-w-md rounded-3xl border p-7 text-center shadow-2xl ${state === "processing" ? "border-indigo-200 bg-white text-slate-950 dark:border-indigo-800 dark:bg-slate-900 dark:text-white" : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50"}`}>
        {state === "processing" ? <Loader2 className="mx-auto h-12 w-12 animate-spin text-indigo-600" /> : <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />}
        <div className="mt-4 text-2xl font-black">{state === "processing" ? "結帳處理中" : "結帳完成"}</div>
        <p className="mt-2 text-sm leading-6 opacity-80">{state === "processing" ? "正在確認庫存、付款、傳票與收據，請勿重複點擊或再次收款。" : "交易已成功寫入，可列印收據或進行下一筆交易。"}</p>
      </div>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: true, dedupingInterval: 15000, focusThrottleInterval: 30000 }}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <CheckoutFeedback />
          <Toaster richColors position="top-right" closeButton duration={6000} visibleToasts={5} />
        </ThemeProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
