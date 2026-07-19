"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Database, Loader2, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function getSafeDestination() {
  if (typeof window === "undefined") return "/workspace";
  const value = new URLSearchParams(window.location.search).get("callbackUrl");
  if (value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/initialize")) return value;
  return "/workspace";
}

export default function InitializePage() {
  const [status, setStatus] = useState<"loading" | "failed">("loading");
  const [error, setError] = useState("");

  const initialize = useCallback(async () => {
    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/tenant-initialization", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });

      if (response.status === 401) {
        window.location.replace(`/login?callbackUrl=${encodeURIComponent("/initialize")}`);
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ready !== true) {
        throw new Error(data.error || "系統初始化尚未完成，請重新嘗試");
      }

      window.location.replace(getSafeDestination());
    } catch (initializeError: any) {
      setError(initializeError?.message || "系統初始化尚未完成，請重新嘗試");
      setStatus("failed");
    }
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-950 to-emerald-950" />
      <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-indigo-500/25 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-500/20 blur-3xl" />

      <section className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white shadow-2xl backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-lg shadow-indigo-500/30">
          {status === "loading" ? <Loader2 className="h-8 w-8 animate-spin" /> : <RefreshCw className="h-8 w-8" />}
        </div>

        <h1 className="mt-6 text-2xl font-black">{status === "loading" ? "系統初始化中" : "初始化尚未完成"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {status === "loading"
            ? "帳號與公司已建立成功，正在準備第一套可直接操作的公司資料。"
            : error}
        </p>

        <div className="mt-6 grid gap-3 text-left text-sm text-slate-300 sm:grid-cols-2">
          <InitializationItem icon={Database} label="建立會計科目與編號規則" />
          <InitializationItem icon={Building2} label="建立公司、倉庫與收銀台設定" />
          <InitializationItem icon={Package} label="批次建立商品與期初庫存" />
          <InitializationItem icon={CheckCircle2} label="建立範例採購、銷售與桌位" />
        </div>

        {status === "loading" ? (
          <div className="mt-6 text-xs text-slate-400">請保持此頁開啟，完成後會自動進入工作台。</div>
        ) : (
          <Button
            type="button"
            onClick={() => void initialize()}
            className="mt-7 w-full bg-gradient-to-r from-indigo-500 to-emerald-500 text-white hover:from-indigo-600 hover:to-emerald-600"
          >
            <RefreshCw className="mr-2 h-4 w-4" />重新初始化
          </Button>
        )}
      </section>
    </main>
  );
}

function InitializationItem({ icon: Icon, label }: { icon: typeof Database; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <Icon className="h-4 w-4 shrink-0 text-emerald-300" />
      <span>{label}</span>
    </div>
  );
}
