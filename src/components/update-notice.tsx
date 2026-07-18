"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

export function UpdateNotice() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const response = await fetch("/api/system/update", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (active) setAvailable(result.localHost === true && result.updateAvailable === true);
      } catch {}
    }
    void check();
    const timer = setInterval(check, 15 * 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  if (!available) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
      <RefreshCw className="h-4 w-4" />
      艾琳 ERP 有安全更新可用
      <Link href="/settings#system-update" className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50">前往更新</Link>
    </div>
  );
}
