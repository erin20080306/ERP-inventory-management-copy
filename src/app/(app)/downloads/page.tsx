"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Database, Download, FileArchive, HardDrive, Info, KeyRound, Laptop, Loader2, ShieldCheck } from "lucide-react";

type Installer = {
  name: string;
  size: number;
  platform: string;
  kind: "company-host" | "workstation";
  sha256: string | null;
  codeSigning: string | null;
};
type Release = { version?: string; generatedAt?: string; prerelease?: boolean; readyForCustomers?: boolean } | null;

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileFlags(file: Installer) {
  const name = file.name.toLowerCase();
  return {
    isWindows: name.includes("windows"),
    isMac: name.includes("macos"),
    isDmg: name.endsWith(".dmg"),
    isZip: name.endsWith(".zip"),
    isArm64: name.includes("arm64"),
  };
}

function downloadNote(file: Installer) {
  const flags = fileFlags(file);
  if (file.kind === "company-host") {
    return flags.isWindows
      ? "Windows 公司主機：只在公司選定的主機電腦安裝"
      : "Mac 公司主機：只在公司選定的主機電腦安裝";
  }
  if (flags.isWindows) return "Windows 工作站：每台 Windows 電腦都要下載";
  if (flags.isMac && flags.isDmg && flags.isArm64) return "Apple 晶片 Mac 建議檔（M1／M2／M3／M4…）";
  if (flags.isMac && flags.isZip && flags.isArm64) return "Mac 備用格式，與 DMG 二選一，不必都下載";
  return "操作工作站";
}

function InstallerCard({ file }: { file: Installer }) {
  const flags = fileFlags(file);
  const recommended = file.kind === "workstation" && flags.isMac && flags.isDmg && flags.isArm64;
  const backup = file.kind === "workstation" && flags.isMac && flags.isZip && flags.isArm64;
  const href = `/api/installers?file=${encodeURIComponent(file.name)}`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <FileArchive className="mt-0.5 h-8 w-8 shrink-0 text-sky-600" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="break-all font-semibold">{file.name}</div>
            {recommended ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">建議檔</span> : null}
            {backup ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">備用格式</span> : null}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{file.platform}・{size(file.size)}</div>
          <div className="mt-2 text-xs font-medium text-foreground/80">{downloadNote(file)}</div>
          {file.kind === "workstation" ? <div className="mt-1 text-[11px] text-sky-700">通過登入驗證後產生短效安全下載連結</div> : null}
          {file.codeSigning === "ad-hoc-manual" ? <div className="mt-1 text-xs font-medium text-amber-700">手動安裝版・第一次需依上方步驟允許</div> : file.codeSigning === "unsigned-test" ? <div className="mt-1 text-xs font-medium text-rose-600">內部測試檔，不可交付</div> : null}
          {file.sha256 ? <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={file.sha256}>SHA-256 {file.sha256}</div> : null}
        </div>
      </div>
      <a href={href} className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">
        <Download className="h-3.5 w-3.5" />下載
      </a>
    </div>
  );
}

export default function DownloadsPage() {
  const [files, setFiles] = useState<Installer[]>([]);
  const [release, setRelease] = useState<Release>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/installers", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "載入失敗");
        setFiles(result.files ?? []);
        setRelease(result.release ?? null);
        setMessage(result.message ?? "");
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  const hostFiles = useMemo(() => files.filter((file) => file.kind === "company-host"), [files]);
  const workstationFiles = useMemo(() => files.filter((file) => file.kind === "workstation"), [files]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">正式桌面版下載</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">此入口只在付款開通後顯示。公司主機只選一台；每台實際操作的電腦再安裝自己的工作站。</p>
          </div>
          <ShieldCheck className="h-10 w-10 text-emerald-600" />
        </div>
        {release?.version ? <p className="mt-3 text-xs text-muted-foreground">版本 {release.version}{files.some((file) => file.codeSigning === "ad-hoc-manual") ? "・手動安裝版" : release.prerelease ? "・測試版本" : "・正式簽章版本"}</p> : null}
      </header>

      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm leading-6 text-sky-950">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-bold">先看懂安裝方式</div>
            <div className="mt-1">公司主機只安裝在一台固定電腦，不是 Windows Host 與 Mac Host 都要裝。工作站則依每台電腦的作業系統下載。</div>
            <div className="mt-2 font-medium">例如「1 對 2、兩台 Windows」：第 1 台下載 Windows Host ZIP＋Windows Setup EXE；第 2 台只下載 Windows Setup EXE。兩台工作站共占 2 個授權席次。</div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
        <div className="border-b border-emerald-200 p-5">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" /><div><h2 className="font-bold text-emerald-950">營運資料保存在您安裝的公司主機電腦</h2><p className="mt-1 text-sm leading-6 text-emerald-900">本機安裝版的商品、客戶、訂單、庫存與帳務資料存放於公司主機上的 PostgreSQL Docker volume，不會把整套營運資料庫放在一般工作站。中央服務只處理公司代碼、授權方案、席次與簽章連線設定。</p></div></div>
        </div>
        <div className="grid gap-px bg-emerald-200 md:grid-cols-3">
          <div className="bg-white/80 p-4"><Database className="h-5 w-5 text-indigo-700" /><div className="mt-2 text-sm font-bold">資料庫不直接對外</div><p className="mt-1 text-xs leading-5 text-slate-600">工作站透過公司主機 HTTPS 閘道操作，PostgreSQL 與應用服務不直接暴露在區網。</p></div>
          <div className="bg-white/80 p-4"><KeyRound className="h-5 w-5 text-amber-700" /><div className="mt-2 text-sm font-bold">裝置與授權雙重驗證</div><p className="mt-1 text-xs leading-5 text-slate-600">工作站私鑰由 macOS Keychain 或 Windows DPAPI 保護，每次請求含簽章、時間與防重播 nonce。</p></div>
          <div className="bg-white/80 p-4"><HardDrive className="h-5 w-5 text-emerald-700" /><div className="mt-2 text-sm font-bold">加密備份需異地保存</div><p className="mt-1 text-xs leading-5 text-slate-600">主機每日建立 AES-256-GCM 加密備份；請定期複製到 NAS 或受控雲端，復原金鑰須另處保管。</p></div>
        </div>
        <div className="p-5 text-xs leading-6 text-emerald-950"><strong>建議安裝順序：</strong>先選定一台長時間開機的公司主機並安裝 Docker Desktop → 手動執行 Host 安裝檔並輸入啟用碼 → 在每台工作站安裝桌面程式，只輸入同一啟用碼 → 系統自動尋找最新主機 IP → 驗證登入權限及第一份備份。</div>
      </section>
      {files.some((file) => file.codeSigning === "ad-hoc-manual") ? <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><div className="font-bold">手動安裝版首次開啟</div><div className="mt-1"><strong>macOS：</strong>下載 DMG，把「艾琳 ERP」拖到「應用程式」，再到「應用程式」對 App 按右鍵並選「打開」。請先刪除先前顯示已損毀的舊 App。</div><div className="mt-1"><strong>Windows：</strong>執行 EXE；若出現 SmartScreen，選「其他資訊」後按「仍要執行」。</div><div className="mt-2 text-xs text-amber-800">本版已做完整性簽章與 SHA-256 核對，但未取得 Apple／Windows 商業憑證，因此第一次需手動允許。</div></section> : null}

      {loading ? (
        <section className="rounded-2xl border bg-card p-5"><div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></section>
      ) : files.length ? (
        <>
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-7 w-7 shrink-0 text-indigo-600" />
              <div>
                <h2 className="text-lg font-bold">步驟 1：只選一個公司主機</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">依公司選定的主機電腦作業系統，Windows 或 Mac 二選一。其他工作站電腦不要重複安裝 Host。</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3">{hostFiles.map((file) => <InstallerCard key={file.name} file={file} />)}</div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Laptop className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" />
              <div>
                <h2 className="text-lg font-bold">步驟 2：每台電腦選自己的工作站</h2>
                <div className="mt-1 space-y-1 text-sm leading-6 text-muted-foreground">
                  <p><strong className="text-foreground">Windows：</strong>下載 ErinERP-Desktop-Windows-x64-Setup.exe。</p>
                  <p><strong className="text-foreground">Apple 晶片 Mac（M1／M2／M3／M4…）：</strong>下載 ErinERP-Desktop-macOS-arm64.dmg，這是建議檔。</p>
                  <p><strong className="text-foreground">Mac ZIP：</strong>ErinERP-Desktop-macOS-arm64.zip 只是備用格式，和 DMG 二選一，不必都下載。</p>
                  <p className="font-medium text-amber-700">目前只提供 Apple 晶片版 Mac 工作站，Intel Mac 尚未提供。</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3">{workstationFiles.map((file) => <InstallerCard key={file.name} file={file} />)}</div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border bg-card p-5"><div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-50 p-6 text-sm text-amber-900">{message || "安裝版尚未發布，請聯絡艾琳設計。"}</div></section>
      )}
    </div>
  );
}
