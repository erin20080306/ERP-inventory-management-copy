"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CheckCircle2, Database, Download, FileArchive, HardDrive, Info, KeyRound, Laptop, Loader2, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { ECOMMERCE_PRICING, PLAN_CATALOG, formatTwd } from "@/lib/plans";

type Installer = {
  name: string;
  size: number;
  updatedAt: string;
  platform: string;
  kind: "company-host" | "workstation";
  sha256: string | null;
  codeSigning: string | null;
};
type Release = { version?: string; generatedAt?: string; prerelease?: boolean; readyForCustomers?: boolean } | null;

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function flags(file: Installer) {
  const name = file.name.toLowerCase();
  return {
    windows: name.includes("windows"),
    mac: name.includes("macos"),
    dmg: name.endsWith(".dmg"),
    zip: name.endsWith(".zip"),
    arm64: name.includes("arm64"),
  };
}

function InstallerCard({ file }: { file: Installer }) {
  const type = flags(file);
  const recommended = file.kind === "workstation" && type.mac && type.dmg && type.arm64;
  const backup = file.kind === "workstation" && type.mac && type.zip && type.arm64;
  const description = file.kind === "company-host"
    ? `${type.windows ? "Windows" : "Mac"} 公司主機，只在公司選定的一台主機電腦安裝`
    : type.windows
      ? "Windows 工作站，每台實際操作的 Windows 電腦都要安裝"
      : recommended
        ? "Apple 晶片 Mac 建議安裝檔（M1／M2／M3／M4…）"
        : backup
          ? "Mac 備用格式，與 DMG 二選一，不必重複下載"
          : "操作工作站";
  const href = `/api/admin/installers-current?file=${encodeURIComponent(file.name)}`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <FileArchive className="mt-0.5 h-8 w-8 shrink-0 text-sky-300" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="break-all font-semibold">{file.name}</div>
            {recommended ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">建議檔</span> : null}
            {backup ? <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">備用格式</span> : null}
          </div>
          <div className="mt-1 text-xs text-slate-500">{file.platform}・{formatFileSize(file.size)}</div>
          <div className="mt-2 text-xs font-medium leading-5 text-slate-300">{description}</div>
          {file.kind === "workstation" ? <div className="mt-1 text-[11px] text-sky-300">登入驗證後產生短效安全下載連結</div> : null}
          {file.codeSigning === "ad-hoc-manual" ? <div className="mt-1 text-xs font-medium text-amber-300">手動安裝版・第一次需允許系統安全提示</div> : file.codeSigning === "unsigned-test" ? <div className="mt-1 text-xs font-medium text-rose-300">內部測試檔，不可交付客戶</div> : null}
          {file.sha256 ? <div className="mt-1 truncate font-mono text-[10px] text-slate-600" title={file.sha256}>SHA-256 {file.sha256}</div> : null}
        </div>
      </div>
      <a href={href} className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold hover:bg-emerald-500"><Download className="h-3.5 w-3.5" />下載</a>
    </div>
  );
}

export default function AdminDownloadsPage() {
  const [files, setFiles] = useState<Installer[]>([]);
  const [release, setRelease] = useState<Release>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/installers-current", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "載入失敗");
        setFiles(result.files ?? []);
        setRelease(result.release ?? null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  const hostFiles = useMemo(() => files.filter((file) => file.kind === "company-host"), [files]);
  const workstationFiles = useMemo(() => files.filter((file) => file.kind === "workstation"), [files]);

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white md:p-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />返回平台管理</Link><h1 className="mt-3 text-3xl font-black">管理員安裝包與開通流程</h1><p className="mt-2 text-sm text-slate-400">公司主機只選一台；每台實際操作的電腦再選自己的工作站安裝檔。</p></div>
          <ShieldCheck className="h-14 w-14 text-emerald-400" />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {["在授權後台確認客戶業態、方案、付款狀態與工作站席次", "只在公司選定的一台固定電腦安裝 Windows 或 Mac 公司主機", "每台實際操作電腦依自己的作業系統安裝工作站並占用一個席次"].map((text, index) => <div key={text} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/15 font-black text-indigo-300">{index + 1}</div><p className="mt-4 text-sm leading-6 text-slate-300">{text}</p></div>)}
        </section>

        <section className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 text-sm leading-6 text-sky-100">
          <div className="flex items-start gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-bold">安裝範例：1 對 2、兩台 Windows</div><div className="mt-1">第 1 台下載 Windows Host ZIP＋Windows Setup EXE；第 2 台只下載 Windows Setup EXE。兩台工作站共占 2 個授權席次。公司主機只選一台，不是 Windows Host 與 Mac Host 都安裝。</div></div></div>
        </section>

        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-7 w-7 shrink-0 text-emerald-300" /><div><h2 className="text-lg font-bold text-emerald-100">交付前必須向客戶說明：營運資料存於客戶公司主機</h2><p className="mt-1 text-sm leading-6 text-slate-300">商品、客戶、訂單、庫存與帳務資料位於客戶選定主機電腦的 PostgreSQL Docker volume；一般工作站不持有完整資料庫。中央僅保存授權、席次、公司代碼與簽章連線資料。</p></div></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-slate-950 p-4"><Database className="h-5 w-5 text-sky-300" /><div className="mt-2 text-sm font-bold">HTTPS 隔離</div><p className="mt-1 text-xs leading-5 text-slate-400">Caddy 為唯一工作站入口；Next.js 與 PostgreSQL 不直接暴露。</p></div>
            <div className="rounded-xl bg-slate-950 p-4"><KeyRound className="h-5 w-5 text-amber-300" /><div className="mt-2 text-sm font-bold">短效租約＋裝置私鑰</div><p className="mt-1 text-xs leading-5 text-slate-400">中央簽章限制業態、公司、席次與到期時間，裝置請求另做防重播簽章。</p></div>
            <div className="rounded-xl bg-slate-950 p-4"><HardDrive className="h-5 w-5 text-emerald-300" /><div className="mt-2 text-sm font-bold">備份與復原責任</div><p className="mt-1 text-xs leading-5 text-slate-400">確認第一份 AES-256-GCM 備份，並要求客戶將備份與復原金鑰分開異地保存。</p></div>
          </div>
          <div className="mt-4 rounded-xl border border-emerald-400/10 bg-slate-950/60 p-4 text-xs leading-6 text-slate-300"><strong className="text-white">標準安裝程序：</strong>選定公司主機 → 安裝 Docker Desktop → 執行 Host 安裝檔與啟用 → 安裝各工作站 → 輸入公司代碼與啟用碼 → 驗證 HTTPS、角色權限、備份與還原金鑰。</div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-start gap-3"><Building2 className="mt-0.5 h-7 w-7 shrink-0 text-indigo-300" /><div><h2 className="text-lg font-bold">步驟 1：只選一個公司主機</h2><p className="mt-1 text-sm leading-6 text-slate-400">依公司固定主機的作業系統二選一。其他工作站電腦不要重複安裝 Host。</p></div></div>
          {release?.version ? <p className="mt-3 text-xs text-slate-500">封裝版本：{release.version}{release.generatedAt ? `・${new Date(release.generatedAt).toLocaleString("zh-TW")}` : ""}</p> : null}
          {loading ? <div className="flex h-28 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/5 p-5 text-sm text-red-200">{error}</div> : hostFiles.length ? <div className="mt-4 grid gap-3">{hostFiles.map((file) => <InstallerCard key={file.name} file={file} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-amber-400/30 bg-amber-400/5 p-6 text-sm text-amber-200">尚未發布公司主機安裝包。</div>}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-start gap-3"><Laptop className="mt-0.5 h-7 w-7 shrink-0 text-emerald-300" /><div><h2 className="text-lg font-bold">步驟 2：每台電腦選自己的工作站</h2><div className="mt-1 space-y-1 text-sm leading-6 text-slate-400"><p><strong className="text-slate-200">Windows：</strong>ErinERP-Desktop-Windows-x64-Setup.exe。</p><p><strong className="text-slate-200">Apple 晶片 Mac：</strong>ErinERP-Desktop-macOS-arm64.dmg 為建議檔。</p><p><strong className="text-slate-200">Mac ZIP：</strong>只是備用格式，與 DMG 二選一，不必都下載。</p><p className="font-semibold text-amber-300">目前尚未提供 Intel Mac 工作站。</p></div></div></div>
          {loading ? <div className="flex h-28 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? null : workstationFiles.length ? <div className="mt-4 grid gap-3">{workstationFiles.map((file) => <InstallerCard key={file.name} file={file} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-amber-400/30 bg-amber-400/5 p-6 text-sm text-amber-200">尚未發布工作站安裝包。</div>}

          {files.some((file) => file.codeSigning === "ad-hoc-manual") ? <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-6 text-amber-100">目前為手動安裝版：macOS 將 App 拖入「應用程式」後第一次右鍵選「打開」；Windows 遇 SmartScreen 時選「其他資訊 → 仍要執行」。已做 bundle 完整性與 SHA-256 核對，但不是商業憑證免提示版本。</div> : release?.prerelease ? <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/5 p-3 text-xs text-rose-200">目前只有內部測試檔，不提供客戶下載。</div> : null}
          {release ? <div className="mt-3 flex gap-3 text-xs"><a className="text-sky-300 hover:text-sky-200" href="/api/admin/installers-current?file=release-manifest.json">下載版本清單</a><a className="text-sky-300 hover:text-sky-200" href="/api/admin/installers-current?file=SHA256SUMS.txt">下載 SHA-256 核對檔</a></div> : null}
          <div className="mt-4 rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-400"><MonitorSmartphone className="mr-2 inline h-4 w-4" />同一個桌面安裝包支援一般 ERP、電商 ERP、零售 POS 與餐飲 POS；主機與安裝流程不變，實際畫面由公司授權業態與使用者角色權限決定。桌面工作站用公司代碼＋啟用碼取得中央簽章設定，成功後才占用一個席次。</div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-bold">客戶費用確認</h2>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="pb-3">方案</th><th>月租</th><th>年租（送 2 個月）</th><th>一次買斷</th><th>買斷後 AI／版本維護</th></tr></thead><tbody className="divide-y divide-slate-800">{PLAN_CATALOG.map((plan) => <tr key={plan.code}><td className="py-3 font-semibold">{plan.name}</td><td>{formatTwd(plan.monthlyPrice)}</td><td>{formatTwd(plan.annualPrice)}</td><td>{formatTwd(plan.lifetimePrice)}<div className="text-xs text-slate-500">含一次約定範圍修改</div></td><td>{formatTwd(plan.maintenancePrice)}／年</td></tr>)}</tbody></table></div>
          <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4">
            <h3 className="font-bold text-rose-100">電商商城＋ERP 專用價格</h3>
            <p className="mt-1 text-xs text-slate-400">月租 {formatTwd(ECOMMERCE_PRICING.monthlyPrice)}；年租 {formatTwd(ECOMMERCE_PRICING.annualPrice)}（12 個月、優惠 2 個月）。</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">{PLAN_CATALOG.map((plan) => <div key={plan.code} className="rounded-lg bg-slate-950 p-3"><div className="text-xs text-slate-500">{plan.name}</div><strong className="mt-1 block text-rose-200">買斷 {formatTwd(ECOMMERCE_PRICING.lifetimeByPlan[plan.code])}</strong></div>)}</div>
            <p className="mt-3 text-xs leading-5 text-slate-400">買斷含一次官網設計修改；月租官網設計修改費 {formatTwd(ECOMMERCE_PRICING.websiteDesignFee.MONTHLY)}，年租 {formatTwd(ECOMMERCE_PRICING.websiteDesignFee.ANNUAL)}。</p>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-400"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />網站不直接收款；與艾琳設計確認付款入帳後，才由管理後台產生啟用碼並綁定已購買的工作站台數。</p>
        </section>
      </div>
    </main>
  );
}
