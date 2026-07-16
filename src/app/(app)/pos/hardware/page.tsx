"use client";

import { useEffect, useRef, useState } from "react";
import { Barcode, Cable, CheckCircle2, CreditCard, ExternalLink, Loader2, MonitorSmartphone, Printer, RefreshCw, Vault } from "lucide-react";
import { toast } from "sonner";

export default function PosHardwareDiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [desktop, setDesktop] = useState<any>(null);
  const [printers, setPrinters] = useState<Array<any>>([]);
  const [busy, setBusy] = useState(false);
  const [barcode, setBarcode] = useState("4006381333931");
  const [printerState, setPrinterState] = useState("READY");
  const [amount, setAmount] = useState("100");
  const [paymentMode, setPaymentMode] = useState("APPROVED");
  const barcodeRef = useRef<HTMLInputElement>(null);

  async function load() {
    setBusy(true);
    try {
      const res = await fetch("/api/pos/hardware/diagnostics", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "診斷資料載入失敗");
      setDiagnostics(data);
      if (window.erinHardware) {
        const [state, detected] = await Promise.all([window.erinHardware.state(), window.erinHardware.printers()]);
        setDesktop(state);
        setPrinters(detected);
      } else {
        setDesktop(null);
        setPrinters([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "診斷資料載入失敗");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(payload: any) {
    setBusy(true);
    try {
      const res = await fetch("/api/pos/hardware/diagnostics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "模擬測試失敗");
      setResult({ action: payload.action, ...data.result });
      toast.success("模擬測試完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模擬測試失敗");
    } finally {
      setBusy(false);
    }
  }

  async function openCustomerDisplay() {
    try {
      if (window.erinHardware) {
        const opened = await window.erinHardware.openCustomerDisplay();
        setResult({ action: "CUSTOMER_DISPLAY_WINDOW", desktop: true, ...opened });
      } else {
        window.open("/pos/customer-display", "erin-pos-customer-display", "noopener,noreferrer");
        setResult({ action: "CUSTOMER_DISPLAY_WINDOW", desktop: false, message: "已開啟瀏覽器客顯分頁" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "客顯開啟失敗");
    }
  }

  function testCustomerDisplay() {
    const channel = new BroadcastChannel("erin-pos-customer-display");
    channel.postMessage({ version: 1, updatedAt: new Date().toISOString(), items: [{ name: "客顯測試商品", quantity: 2, amount: 100 }], total: 100, paid: 500, change: 400, message: "客顯通訊測試成功" });
    channel.close();
    setResult({ action: "CUSTOMER_DISPLAY_MESSAGE", simulated: true, message: "測試畫面已送出；請核對另一個螢幕或分頁。" });
  }

  const acceptance = [
    ["條碼槍", "HID 結束字元、GTIN 檢查與精確商品查詢", "模擬通過／實機待驗"],
    ["80mm 印表機", "80mm CSS、ESC/POS 初始化、錯誤、補印與切紙", "模擬通過／驅動待驗"],
    ["錢櫃", "ESC p 脈衝命令與主管稽核", "模擬通過／電氣待驗"],
    ["客顯", "即時訊息與桌面 App 第二螢幕視窗", desktop ? "桌面橋接可用／螢幕待驗" : "瀏覽器模擬通過"],
    ["刷卡機", "核准、拒絕、取消、逾時與逾時後查詢", "狀態機通過／收單待驗"],
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Cable className="h-6 w-6 text-indigo-600" />POS 硬體模擬診斷</h1><p className="mt-1 text-sm text-muted-foreground">無實機時驗證軟體命令、錯誤分支與桌面橋接；型號確認後沿用同一清單實機簽收。</p></div>
        <button onClick={() => void load()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4"><RefreshCw className="h-4 w-4" />重新偵測</button>
      </header>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>測試邊界：</strong>{diagnostics?.warning || "載入中…"} 實機到貨後仍須逐台核對驅動、中文字、紙寬、切紙、錢櫃電壓與收單銀行端對端結果。</div>

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-bold">桌面硬體橋接</div><div className="mt-1 text-sm text-muted-foreground">{desktop ? `艾琳 ERP App ${desktop.appVersion} · ${desktop.platform} · ${desktop.displayCount} 個螢幕` : "目前是一般瀏覽器，只能做協定模擬；安裝版才能偵測作業系統印表機與第二螢幕。"}</div></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${desktop ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{desktop ? "橋接已連線" : "瀏覽器模式"}</span></div>
        {desktop && <div className="mt-4 rounded-xl bg-muted/40 p-3 text-sm"><div className="font-semibold">作業系統偵測到的印表機</div>{printers.length ? <ul className="mt-2 space-y-1">{printers.map((printer) => <li key={printer.name}>• {printer.displayName || printer.name}{printer.isDefault ? "（預設）" : ""}</li>)}</ul> : <div className="mt-2 text-amber-700">目前未偵測到印表機；可先安裝作業系統 PDF／測試印表機佇列。</div>}</div>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-card p-5"><div className="flex items-center gap-2 font-bold"><Barcode className="h-5 w-5" />條碼槍（HID 鍵盤模式）</div><p className="text-sm text-muted-foreground">掃描器等同高速鍵盤；Enter 後移除控制字元，GTIN 可檢查碼，內部條碼仍可精確比對。</p><div className="flex gap-2"><input ref={barcodeRef} value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void run({ action: "BARCODE_TEST", raw: `${barcode}\r` }); }} className="h-10 flex-1 rounded-lg border px-3 font-mono" /><button onClick={() => void run({ action: "BARCODE_TEST", raw: `${barcode}\r` })} className="h-10 rounded-lg bg-indigo-600 px-4 text-white">模擬掃描</button></div></section>

        <section className="space-y-4 rounded-2xl border bg-card p-5"><div className="flex items-center gap-2 font-bold"><Printer className="h-5 w-5" />80mm 印表機</div><p className="text-sm text-muted-foreground">虛擬傳輸可測正常、離線、缺紙與開蓋；中文字型由作業系統驅動列印測試頁驗證。</p><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select value={printerState} onChange={(event) => setPrinterState(event.target.value)} className="h-10 rounded-lg border bg-background px-3"><option value="READY">正常</option><option value="OFFLINE">離線</option><option value="PAPER_OUT">缺紙</option><option value="COVER_OPEN">上蓋開啟</option></select><button onClick={() => void run({ action: "PRINTER_TEST", state: printerState })} className="h-10 rounded-lg bg-indigo-600 px-4 text-white">執行虛擬傳輸</button></div><button onClick={() => window.open("/print/pos/hardware-test", "_blank", "noopener,noreferrer")} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4"><ExternalLink className="h-4 w-4" />開啟 80mm 系統列印測試</button></section>

        <section className="space-y-4 rounded-2xl border bg-card p-5"><div className="flex items-center gap-2 font-bold"><Vault className="h-5 w-5" />錢櫃</div><p className="text-sm text-muted-foreground">產生 Epson 相容 ESC p 接腳與脈衝命令；沒有實機時不會通電。</p><button onClick={() => void run({ action: "DRAWER_TEST" })} className="h-10 rounded-lg bg-indigo-600 px-4 text-white">模擬開櫃命令</button><code className="block break-all rounded-lg bg-muted p-2 text-xs">{diagnostics?.devices?.drawer?.commandHex || "—"}</code></section>

        <section className="space-y-4 rounded-2xl border bg-card p-5"><div className="flex items-center gap-2 font-bold"><MonitorSmartphone className="h-5 w-5" />客戶顯示器</div><p className="text-sm text-muted-foreground">安裝版優先在第二螢幕全螢幕開啟；一般瀏覽器以第二分頁模擬同源即時同步。</p><div className="flex flex-wrap gap-2"><button onClick={() => void openCustomerDisplay()} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4"><ExternalLink className="h-4 w-4" />開啟客顯</button><button onClick={testCustomerDisplay} className="h-10 rounded-lg bg-indigo-600 px-4 text-white">送出測試畫面</button></div></section>

        <section className="space-y-4 rounded-2xl border bg-card p-5 lg:col-span-2"><div className="flex items-center gap-2 font-bold"><CreditCard className="h-5 w-5" />刷卡機狀態機</div><p className="text-sm text-muted-foreground">逾時不得直接重刷或判定失敗，必須保留相同交易碼向終端機／收單端查詢，避免重複扣款。</p><div className="grid gap-2 sm:grid-cols-[160px_200px_auto]"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="h-10 rounded-lg border px-3 text-right" /><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} className="h-10 rounded-lg border bg-background px-3"><option value="APPROVED">模擬核准</option><option value="DECLINED">模擬拒絕</option><option value="CANCELLED">模擬取消</option><option value="TIMEOUT">模擬逾時／待查詢</option></select><button onClick={() => void run({ action: "PAYMENT_TEST", amount: Number(amount), mode: paymentMode, requestId: crypto.randomUUID() })} className="h-10 rounded-lg bg-indigo-600 px-4 text-white">執行刷卡流程</button></div></section>
      </div>

      <section className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-left">設備</th><th className="p-3 text-left">無實機驗證範圍</th><th className="p-3 text-left">目前結論</th></tr></thead><tbody>{acceptance.map(([device, scope, status]) => <tr key={device} className="border-t"><td className="p-3 font-semibold">{device}</td><td className="p-3">{scope}</td><td className="p-3"><span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />{status}</span></td></tr>)}</tbody></table></section>

      <section className="min-h-40 rounded-2xl border bg-slate-950 p-5 text-slate-100"><div className="mb-3 text-xs uppercase tracking-wider text-slate-400">Latest simulation result</div>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <pre className="whitespace-pre-wrap break-all text-xs">{result ? JSON.stringify(result, null, 2) : "尚未執行測試"}</pre>}</section>
    </div>
  );
}
