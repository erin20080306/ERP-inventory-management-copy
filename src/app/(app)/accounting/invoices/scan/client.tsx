"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, QrCode, FileImage, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseTaiwanInvoiceQR, type ParsedInvoiceQR } from "@/lib/tw-invoice-qr";

type Mode = "qr" | "photo" | null;

export function InvoiceScanClient() {
  const [mode, setMode] = useState<Mode>(null);
  const [parsed, setParsed] = useState<ParsedInvoiceQR | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 手動編輯欄位（電子或紙本都用同一表單）
  const [form, setForm] = useState({
    type: "PURCHASE", // 預設進項（你買東西收到的發票）
    invoiceDate: new Date().toISOString().slice(0, 10),
    number: "",
    sellerName: "",
    sellerTaxId: "",
    buyerTaxId: "",
    amountExTax: "",
    taxAmount: "",
    totalAmount: "",
    remark: "",
  });

  function handleParsed(p: ParsedInvoiceQR) {
    setParsed(p);
    setForm((f) => ({
      ...f,
      number: p.invoiceNumber || f.number,
      invoiceDate: p.date || f.invoiceDate,
      sellerTaxId: p.sellerTaxId || f.sellerTaxId,
      buyerTaxId: p.buyerTaxId || f.buyerTaxId,
      amountExTax: p.amountExTax != null ? String(p.amountExTax) : f.amountExTax,
      taxAmount: p.taxAmount != null ? String(p.taxAmount) : f.taxAmount,
      totalAmount: p.totalAmount != null ? String(p.totalAmount) : f.totalAmount,
      remark: p.items?.length ? "電子發票項目：" + p.items.map((i: { name: string }) => i.name).join("、") : f.remark,
    }));
    toast.success("已讀取電子發票 QR Code");
  }

  async function handleSave() {
    if (!form.number || !form.totalAmount) {
      toast.error("請至少填寫發票號碼與總額");
      return;
    }
    setSaving(true);
    try {
      // 銷項需要 customerId，進項需要 supplierId；這裡先以單筆 items 寫入備註
      const payload: any = {
        type: form.type,
        invoiceDate: form.invoiceDate,
        number: form.number,
        items: [
          {
            description: form.sellerName ? `${form.sellerName} 發票` : "掃描發票",
            quantity: 1,
            unitPrice: Number(form.amountExTax || form.totalAmount),
            taxRate: form.amountExTax ? Number(form.taxAmount) / Number(form.amountExTax) : 0.05,
          },
        ],
        remark: [form.sellerTaxId && `賣方統編:${form.sellerTaxId}`, form.buyerTaxId && `買方統編:${form.buyerTaxId}`, form.remark].filter(Boolean).join(" | "),
      };
      // 注意：此 API 要求 customerId/supplierId，這裡先提示使用者
      toast.info("已備好發票資料，請至發票管理填入客戶/供應商後儲存", { duration: 4000 });
      sessionStorage.setItem("invoice_scan_draft", JSON.stringify(payload));
      // 跳轉到發票管理頁
      window.location.href = "/accounting/invoices?draft=1";
    } catch (e: any) {
      toast.error(e.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 模式選擇 */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          className={`cursor-pointer transition ${mode === "qr" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setMode("qr")}
        >
          <CardContent className="pt-6 flex flex-col items-center gap-2 text-center">
            <QrCode className="h-10 w-10 text-blue-600" />
            <div className="font-medium">電子發票 / 收銀機發票</div>
            <div className="text-xs text-muted-foreground">掃描 QR Code 自動填入</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition ${mode === "photo" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setMode("photo")}
        >
          <CardContent className="pt-6 flex flex-col items-center gap-2 text-center">
            <Camera className="h-10 w-10 text-green-600" />
            <div className="font-medium">三聯式 / 紙本發票</div>
            <div className="text-xs text-muted-foreground">拍照記錄並手動輸入</div>
          </CardContent>
        </Card>
      </div>

      {mode === "qr" && <QRScanner onParsed={handleParsed} />}
      {mode === "photo" && <PhotoCapture onCapture={setPhoto} photo={photo} onOcrResult={(extracted) => {
        setForm((f) => ({
          ...f,
          number: extracted.invoiceNumber || f.number,
          invoiceDate: extracted.date || f.invoiceDate,
          sellerTaxId: extracted.sellerTaxId || f.sellerTaxId,
          buyerTaxId: extracted.buyerTaxId || f.buyerTaxId,
          amountExTax: extracted.amountExTax != null ? String(extracted.amountExTax) : f.amountExTax,
          taxAmount: extracted.taxAmount != null ? String(extracted.taxAmount) : f.taxAmount,
          totalAmount: extracted.totalAmount != null ? String(extracted.totalAmount) : f.totalAmount,
        }));
      }} />}

      {/* 共用表單 */}
      {mode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {parsed && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              發票資料
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>類型</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="PURCHASE">進項（收到的發票）</option>
                  <option value="SALES">銷項（開出的發票）</option>
                </select>
              </div>
              <div>
                <Label>發票日期</Label>
                <Input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
              </div>
              <div>
                <Label>發票號碼</Label>
                <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="AB12345678" />
              </div>
              <div>
                <Label>賣方統編</Label>
                <Input value={form.sellerTaxId} onChange={(e) => setForm({ ...form, sellerTaxId: e.target.value })} />
              </div>
              <div>
                <Label>賣方名稱</Label>
                <Input value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} />
              </div>
              <div>
                <Label>買方統編</Label>
                <Input value={form.buyerTaxId} onChange={(e) => setForm({ ...form, buyerTaxId: e.target.value })} />
              </div>
              <div>
                <Label>未稅金額</Label>
                <Input type="number" value={form.amountExTax} onChange={(e) => setForm({ ...form, amountExTax: e.target.value })} />
              </div>
              <div>
                <Label>稅額</Label>
                <Input type="number" value={form.taxAmount} onChange={(e) => setForm({ ...form, taxAmount: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>含稅總額</Label>
                <Input type="number" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>備註</Label>
                <Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
              </div>
            </div>
            <Button className="w-full" disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              送至發票管理
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ============================================================ */
/*                       QR 掃描元件                              */
/* ============================================================ */
function QRScanner({ onParsed }: { onParsed: (p: ParsedInvoiceQR) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 收集左/右 QR
  const leftRef = useRef<string | null>(null);
  const rightRef = useRef<string | null>(null);

  async function start() {
    setError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!ref.current) return;
      const scanner = new Html5Qrcode(ref.current.id);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          // 判斷左右 QR
          if (text.length >= 77 && /^[A-Z]{2}\d{8}/.test(text)) {
            leftRef.current = text;
          } else if (text.startsWith("**")) {
            rightRef.current = text;
          }
          // 嘗試解析
          try {
            const parsed = parseTaiwanInvoiceQR(leftRef.current ?? text, rightRef.current ?? undefined);
            if (parsed.invoiceNumber) {
              onParsed(parsed);
              stop();
            }
          } catch {}
        },
        () => {}
      );
      setScanning(true);
    } catch (e: any) {
      setError(e.message || "無法啟動相機");
    }
  }

  async function stop() {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {}
    setScanning(false);
  }

  useEffect(() => () => { stop(); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">掃描電子發票 QR Code</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div id="qr-scanner-region" ref={ref} className="w-full max-w-md mx-auto aspect-square bg-black/5 rounded overflow-hidden" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-center">
          {!scanning ? (
            <Button onClick={start}><Camera className="h-4 w-4" />啟動相機</Button>
          ) : (
            <Button variant="outline" onClick={stop}>停止</Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          請對準發票左右兩個 QR Code（一般電子發票會有兩個）
        </p>
      </CardContent>
    </Card>
  );
}

/* ============================================================ */
/*                  拍照元件 + OCR 自動辨識                       */
/* ============================================================ */
type OCRResult = {
  invoiceNumber?: string;
  date?: string;
  sellerTaxId?: string;
  buyerTaxId?: string;
  amountExTax?: number;
  taxAmount?: number;
  totalAmount?: number;
  rawText?: string;
};

function PhotoCapture({ onCapture, photo, onOcrResult }: {
  onCapture: (data: string) => void;
  photo: string | null;
  onOcrResult?: (r: OCRResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState<string>("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onCapture(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function runOCR() {
    if (!photo) return;
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const { default: Tesseract } = await import("tesseract.js");
      const { data } = await Tesseract.recognize(photo, "chi_tra+eng", {
        logger: (m: any) => { if (m.progress) setOcrProgress(Math.round(m.progress * 100)); },
      });
      const text = data.text;
      setOcrText(text);
      const parsed = parseInvoiceText(text);
      onOcrResult?.(parsed);
      toast.success("辨識完成");
    } catch (e: any) {
      toast.error("OCR 失敗：" + e.message);
    } finally {
      setOcrBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">拍攝紙本發票 (三聯式 / 二聯式)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
        {photo ? (
          <img src={photo} alt="發票" className="w-full max-w-md mx-auto rounded border" />
        ) : (
          <div className="w-full max-w-md mx-auto aspect-[4/3] bg-muted/30 border-2 border-dashed rounded flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileImage className="h-12 w-12" />
            <p className="text-sm">尚未拍照</p>
          </div>
        )}
        <div className="flex gap-2 justify-center flex-wrap">
          <Button onClick={() => inputRef.current?.click()}>
            <Camera className="h-4 w-4" />
            {photo ? "重新拍照" : "拍照 / 選擇圖片"}
          </Button>
          {photo && (
            <Button variant="outline" disabled={ocrBusy} onClick={runOCR}>
              {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {ocrBusy ? `辨識中 ${ocrProgress}%` : "自動辨識 (OCR)"}
            </Button>
          )}
        </div>
        {ocrText && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">辨識文字（可展開檢視）</summary>
            <pre className="mt-2 p-2 bg-muted/40 rounded whitespace-pre-wrap max-h-40 overflow-auto">{ocrText}</pre>
          </details>
        )}
        <p className="text-xs text-muted-foreground text-center">
          建議拍攝時讓發票完整在框內、字跡清楚。OCR 為輔助識別，請務必檢查欄位。
        </p>
      </CardContent>
    </Card>
  );
}

/** 從 OCR 文字嘗試解析發票欄位 */
function parseInvoiceText(text: string): OCRResult {
  const out: OCRResult = { rawText: text };
  // 發票號碼: 2 英文字母 + 8 數字 (e.g. AB-12345678 或 AB 12345678)
  const numMatch = text.match(/([A-Z]{2})[\s\-]?(\d{8})/);
  if (numMatch) out.invoiceNumber = numMatch[1] + numMatch[2];

  // 日期: 民國年 e.g. 113/12/03 或 西元 2024/12/03 或 2024-12-03
  const rocDate = text.match(/(\d{2,3})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (rocDate) {
    const y = parseInt(rocDate[1], 10);
    const yyyy = y < 200 ? y + 1911 : y;
    out.date = `${yyyy}-${rocDate[2].padStart(2, "0")}-${rocDate[3].padStart(2, "0")}`;
  }

  // 統編：8 碼數字 (賣方 / 買方)，會有 2 組
  const taxIds = Array.from(text.matchAll(/(?<!\d)(\d{8})(?!\d)/g)).map((m) => m[1]);
  if (taxIds[0]) out.sellerTaxId = taxIds[0];
  if (taxIds[1]) out.buyerTaxId = taxIds[1];

  // 金額：嘗試從關鍵字旁邊抓
  const totalMatch = text.match(/(總計|合計|金額)[\s:：]*([\d,]+)/);
  if (totalMatch) out.totalAmount = Number(totalMatch[2].replace(/,/g, ""));

  const taxMatch = text.match(/(營業稅|稅額)[\s:：]*([\d,]+)/);
  if (taxMatch) out.taxAmount = Number(taxMatch[2].replace(/,/g, ""));

  const exTaxMatch = text.match(/(銷售額|未稅)[\s:：]*([\d,]+)/);
  if (exTaxMatch) out.amountExTax = Number(exTaxMatch[2].replace(/,/g, ""));

  // 若 total 但沒未稅，估算
  if (out.totalAmount && !out.amountExTax) {
    out.amountExTax = Math.round(out.totalAmount / 1.05);
    out.taxAmount = out.totalAmount - out.amountExTax;
  }
  return out;
}
