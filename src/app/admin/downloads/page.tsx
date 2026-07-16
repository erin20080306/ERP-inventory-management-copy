"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download, FileArchive, Loader2, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { PLAN_CATALOG, formatTwd } from "@/lib/plans";

type Installer = {
  name: string;
  size: number;
  updatedAt: string;
  platform: string;
  kind: "company-host" | "workstation";
  sha256: string | null;
};
type Release = { version?: string; generatedAt?: string; prerelease?: boolean; readyForCustomers?: boolean } | null;

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminDownloadsPage() {
  const [files, setFiles] = useState<Installer[]>([]);
  const [release, setRelease] = useState<Release>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/admin/installers", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "載入失敗");
        setFiles(result.files ?? []);
        setRelease(result.release ?? null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white md:p-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />返回平台管理</Link><h1 className="mt-3 text-3xl font-black">管理員安裝包與開通流程</h1><p className="mt-2 text-sm text-slate-400">本頁只允許平台超級管理員存取；客戶付款後才提供對應席次與啟用碼。</p></div>
          <ShieldCheck className="h-14 w-14 text-emerald-400" />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {["在授權後台確認客戶業態、方案、付款狀態與工作站台數", "先執行公司主機包；啟用成功後自動登錄主機網址、CA 憑證並產生公司代碼", "每台已購席次的電腦安裝桌面工作站，只輸入公司代碼與啟用碼即可安全連線"].map((text, index) => <div key={text} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/15 font-black text-indigo-300">{index + 1}</div><p className="mt-4 text-sm leading-6 text-slate-300">{text}</p></div>)}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Download className="h-5 w-5 text-emerald-400" />已發布安裝包</h2>
          {release?.version ? <p className="mt-2 text-xs text-slate-500">封裝版本：{release.version}{release.generatedAt ? `・${new Date(release.generatedAt).toLocaleString("zh-TW")}` : ""}</p> : null}
          {loading ? <div className="flex h-28 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/5 p-5 text-sm text-red-200">{error}</div> : files.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{files.map((file) => <div key={file.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4"><div className="flex min-w-0 items-center gap-3"><FileArchive className="h-8 w-8 shrink-0 text-sky-300" /><div className="min-w-0"><div className="truncate font-semibold">{file.name}</div><div className="mt-1 text-xs text-slate-500">{file.kind === "company-host" ? "公司主機" : "操作工作站"}・{file.platform}・{formatFileSize(file.size)}</div>{file.sha256 ? <div className="mt-1 truncate font-mono text-[10px] text-slate-600" title={file.sha256}>SHA-256 {file.sha256}</div> : null}</div></div><a href={`/api/admin/installers?file=${encodeURIComponent(file.name)}`} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold hover:bg-emerald-500">下載</a></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-amber-400/30 bg-amber-400/5 p-6 text-sm text-amber-200">尚未發布安裝包。可先發布未簽章版本；客戶安裝時會收到作業系統安全提醒。</div>}
          {release?.prerelease ? <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">目前為未簽章測試版本；付款開通後可提供客戶下載，但安裝時可能出現 Windows／macOS 安全提醒。</div> : null}
          {release ? <div className="mt-3 flex gap-3 text-xs"><a className="text-sky-300 hover:text-sky-200" href="/api/admin/installers?file=release-manifest.json">下載版本清單</a><a className="text-sky-300 hover:text-sky-200" href="/api/admin/installers?file=SHA256SUMS.txt">下載 SHA-256 核對檔</a></div> : null}
          <div className="mt-4 rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-400"><MonitorSmartphone className="mr-2 inline h-4 w-4" />同一個桌面安裝包支援三種業態；實際畫面由公司授權業態與使用者角色權限決定。未簽章版本可交付使用，但 Windows／macOS 可能要求客戶手動確認安全警告；日後取得憑證再升級簽章即可。</div>
          <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-400/5 p-4 text-xs leading-6 text-sky-100">公司主機安裝成功時會自動登錄網址與 CA 憑證；桌面工作站用公司代碼＋啟用碼取得中央 Ed25519 簽章設定，成功後才占用一個席次。例如 1 對 2 最多登記兩台工作站，換機需先由管理後台解除舊裝置。封閉內網例外情況才由安裝人員手動匯入。</div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-bold">客戶費用確認</h2>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="pb-3">方案</th><th>月租</th><th>年租（送 2 個月）</th><th>一次買斷</th><th>買斷後 AI／版本維護</th></tr></thead><tbody className="divide-y divide-slate-800">{PLAN_CATALOG.map((plan) => <tr key={plan.code}><td className="py-3 font-semibold">{plan.name}</td><td>{formatTwd(plan.monthlyPrice)}</td><td>{formatTwd(plan.annualPrice)}</td><td>{formatTwd(plan.lifetimePrice)}<div className="text-xs text-slate-500">含一次約定範圍修改</div></td><td>{formatTwd(plan.maintenancePrice)}／年</td></tr>)}</tbody></table></div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-400"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />網站不直接收款；與艾琳設計確認付款入帳後，才由管理後台產生啟用碼並綁定已購買的工作站台數。</p>
        </section>
      </div>
    </main>
  );
}
