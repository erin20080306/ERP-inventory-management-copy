"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Clock, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import type { LicenseAccess } from "@/lib/license";

export function TrialGate({ children, initialAccess }: { children: React.ReactNode; initialAccess: LicenseAccess }) {
  const [access, setAccess] = useState(initialAccess);
  const [checking, setChecking] = useState(false);
  const expiryRef = useRef<number | null>(
    initialAccess.trialExpiresAt ? new Date(initialAccess.trialExpiresAt).getTime() : null,
  );

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/trial", { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as LicenseAccess;
      setAccess(next);
      expiryRef.current = next.trialExpiresAt ? new Date(next.trialExpiresAt).getTime() : null;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const serverCheck = window.setInterval(refresh, 5 * 60_000);
    const countdown = window.setInterval(() => {
      if (!expiryRef.current || access.status !== "trial") return;
      const remainMs = Math.max(0, expiryRef.current - Date.now());
      setAccess((current) => ({ ...current, remainMs }));
      if (remainMs === 0) void refresh();
    }, 1_000);
    return () => {
      window.clearInterval(serverCheck);
      window.clearInterval(countdown);
    };
  }, [access.status, refresh]);

  if (!access.allowed) {
    return <BlockedAccess access={access} checking={checking} onRefresh={refresh} />;
  }

  return (
    <>
      {access.status === "trial" && <TrialBanner remainMs={access.remainMs ?? 0} />}
      {access.status === "paid" && access.subscriptionRemainMs !== undefined && access.subscriptionRemainMs <= 7 * 86_400_000 && (
        <div className="sticky top-0 z-[999] flex items-center justify-center gap-2 bg-indigo-600 px-4 py-2 text-sm text-white shadow print:hidden">
          <CalendarClock className="h-4 w-4" />
          授權將於 {Math.max(0, Math.ceil(access.subscriptionRemainMs / 86_400_000))} 日後到期
          <Link href="/plans" className="ml-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">聯絡續約</Link>
        </div>
      )}
      {children}
    </>
  );
}

function TrialBanner({ remainMs }: { remainMs: number }) {
  const totalSeconds = Math.max(0, Math.floor(remainMs / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  return (
    <div className="sticky top-0 z-[999] flex flex-wrap items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-medium text-white shadow print:hidden">
      <Clock className="h-4 w-4" />
      3 日試用剩餘：{days} 日 {hours} 小時 {minutes} 分
      <Link href="/plans" className="ml-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-orange-700">查看方案並聯絡開通</Link>
    </div>
  );
}

function BlockedAccess({ access, checking, onRefresh }: { access: LicenseAccess; checking: boolean; onRefresh: () => Promise<void> }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-6 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">系統目前已封鎖使用</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{access.reason ?? "試用或授權已到期"}</p>
        <p className="mt-2 text-xs text-slate-500">到期判定採中央伺服器時間；更改電腦日期或重新安裝不會重置。</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link href="/plans" className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold hover:bg-indigo-400">聯絡艾琳設計開通</Link>
          <button onClick={onRefresh} disabled={checking} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm hover:bg-white/10 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />重新檢查授權
          </button>
        </div>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="mt-6 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
          <LogOut className="h-3.5 w-3.5" />登出
        </button>
      </section>
    </main>
  );
}
