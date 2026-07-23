"use client";
import { useState, useEffect, useRef } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatMoney, formatNumber } from "@/lib/utils";
import { code128BSvg } from "@/lib/code128";
import { Barcode, Printer } from "lucide-react";

type Product = {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  spec?: string | null;
  imageUrl?: string | null;
  costPrice: any;
  salePrice: any;
  safetyStock: any;
  isActive: boolean;
  isPublished: boolean;
  stockTotal?: number;
  soldTotal?: number;
  categoryId?: string | null;
  unitId?: string | null;
  updatedBy?: string | null;
};

const LABEL_SIZES = {
  "40x30": { width: 40, height: 30, label: "40 × 30 mm" },
  "50x30": { width: 50, height: 30, label: "50 × 30 mm" },
  "60x40": { width: 60, height: 40, label: "60 × 40 mm" },
} as const;

type LabelSize = keyof typeof LABEL_SIZES;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function BarcodePreview({ value }: { value: string }) {
  try {
    return (
      <div
        className="h-20 w-full overflow-hidden"
        dangerouslySetInnerHTML={{ __html: code128BSvg(value, { height: 64 }) }}
      />
    );
  } catch (error) {
    return <div className="py-5 text-center text-sm text-red-600">{error instanceof Error ? error.message : "無法產生條碼"}</div>;
  }
}

function ProductDialog({ open, onClose, row, onSaved, isCommerce = false }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [autofillHint, setAutofillHint] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setForm(
      row ?? {
        sku: "",
        name: "",
        spec: "",
        imageUrl: "",
        costPrice: "",
        salePrice: "",
        safetyStock: "",
        isActive: true,
        isPublished: true,
      }
    );
    setAutofillHint(null);
  }, [row, open]);

  // 新增模式下：輸入 SKU 後查相同 SKU 自動帶入成本/售價
  useEffect(() => {
    if (row) return; // 編輯模式不觸發
    const sku = String(form.sku ?? "").trim();
    if (sku.length < 2) { setAutofillHint(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(sku)}&pageSize=5`);
        const d = await res.json();
        const exact = (d.items as any[]).find((p) => p.sku === sku);
        if (exact) {
          setForm((f: any) => ({
            ...f,
            name: f.name || exact.name,
            spec: f.spec || exact.spec,
            costPrice: f.costPrice || Number(exact.costPrice),
            salePrice: f.salePrice || Number(exact.salePrice),
            barcode: f.barcode || exact.barcode,
          }));
          setAutofillHint(`已自動帶入：${exact.name} 成本 ${exact.costPrice} / 售價 ${exact.salePrice}`);
        } else {
          setAutofillHint(null);
        }
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [form.sku, row]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(row ? `/api/products/${row.id}` : "/api/products", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error((await res.json()).error || "上傳失敗");

      const data = await res.json();
      setForm({ ...form, imageUrl: data.url });
      toast.success("圖片上傳成功");
    } catch (e: any) {
      toast.error(e.message || "上傳失敗");
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveImage() {
    setForm({ ...form, imageUrl: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{row ? "編輯商品" : "新增商品"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>SKU *</Label>
            <Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            {autofillHint && <p className="text-xs text-emerald-600">{autofillHint}</p>}
          </div>
          <div className="space-y-1">
            <Label>條碼</Label>
            <div className="flex gap-2">
              <Input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!String(form.sku ?? "").trim()}
                onClick={() => setForm({ ...form, barcode: String(form.sku ?? "").trim() })}
              >
                使用 SKU
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">可輸入既有商品條碼；沒有條碼時可直接使用 SKU，POS 掃描同樣可辨識。</p>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>商品名稱 *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>規格</Label>
            <Input value={form.spec ?? ""} onChange={(e) => setForm({ ...form, spec: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>成本價</Label>
            <Input type="number" step="1" value={form.costPrice ?? 0} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>售價</Label>
            <Input type="number" step="1" value={form.salePrice ?? 0} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>安全庫存</Label>
            <Input type="number" step="1" value={form.safetyStock ?? 0} onChange={(e) => setForm({ ...form, safetyStock: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>商品圖片</Label>
            <div className="flex items-start gap-3">
              {form.imageUrl ? (
                <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border">
                  <img src={form.imageUrl} alt="商品圖片" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/20">
                  <span className="text-xs text-muted-foreground">無圖片</span>
                </div>
              )}
              <div className="flex-1 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "上傳中..." : form.imageUrl ? "更換圖片" : "上傳圖片"}
                </Button>
                <p className="text-xs text-muted-foreground">支援 JPG、PNG、WebP、GIF，最大 5MB；儲存後餐飲點餐與零售商品同步更新。</p>
              </div>
            </div>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>備註</Label>
            <Input value={form.remark ?? ""} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input
              type="checkbox"
              checked={!!form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            啟用（ERP／POS 可用）
          </label>
          {isCommerce && (
            <label className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm col-span-2">
              <input
                type="checkbox"
                checked={form.isPublished !== false}
                onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                className="mt-0.5"
              />
              <span><b className="block text-rose-800">一般消費者官網上架</b><small className="mt-1 block text-rose-600">取消後只會從官網下架，不影響 ERP 庫存、採購或歷史訂單。</small></span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductClient({ isCommerce = false }: { isCommerce?: boolean }) {
  const [publicationRevision, setPublicationRevision] = useState(0);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [labelQuantity, setLabelQuantity] = useState("1");
  const [labelSize, setLabelSize] = useState<LabelSize>("50x30");

  function openBarcodePrinter(product: Product) {
    setBarcodeProduct(product);
    setLabelQuantity("1");
  }

  function printBarcodeLabels() {
    if (!barcodeProduct) return;
    const barcodeValue = String(barcodeProduct.barcode || barcodeProduct.sku || "").trim();
    let barcodeSvg = "";
    try {
      barcodeSvg = code128BSvg(barcodeValue, { height: 64 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法產生條碼");
      return;
    }

    const quantity = Math.max(1, Math.min(200, Number.parseInt(labelQuantity, 10) || 1));
    const size = LABEL_SIZES[labelSize];
    const name = escapeHtml(barcodeProduct.name);
    const spec = escapeHtml(barcodeProduct.spec || "");
    const price = escapeHtml(formatMoney(barcodeProduct.salePrice));
    const code = escapeHtml(barcodeValue);
    const labels = Array.from({ length: quantity }, () => `
      <section class="label">
        <div class="name">${name}</div>
        ${spec ? `<div class="spec">${spec}</div>` : ""}
        <div class="barcode">${barcodeSvg}</div>
        <div class="bottom"><span class="code">${code}</span><strong>${price}</strong></div>
      </section>
    `).join("");

    const popup = window.open("", "_blank", "width=760,height=900");
    if (!popup) {
      toast.error("瀏覽器阻擋列印視窗，請允許此 ERP 開啟彈出式視窗");
      return;
    }
    popup.document.open();
    popup.document.write(`<!doctype html>
      <html lang="zh-Hant">
        <head>
          <meta charset="utf-8" />
          <title>${name} 條碼標籤</title>
          <style>
            @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: white; color: black; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .label { width: ${size.width}mm; height: ${size.height}mm; padding: 1.6mm 2mm; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; break-after: page; page-break-after: always; }
            .label:last-child { break-after: auto; page-break-after: auto; }
            .name { font-size: ${size.width <= 40 ? 10 : 12}px; line-height: 1.15; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .spec { font-size: 9px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .barcode { width: 100%; height: ${size.height >= 40 ? 18 : 14}mm; }
            .barcode svg { display: block; width: 100%; height: 100%; }
            .bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; font-size: 9px; line-height: 1; }
            .bottom strong { font-size: ${size.width <= 40 ? 11 : 13}px; white-space: nowrap; }
            .code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
          </style>
        </head>
        <body>${labels}<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),150));<\/script></body>
      </html>`);
    popup.document.close();
    popup.focus();
  }

  const barcodePreviewValue = String(barcodeProduct?.barcode || barcodeProduct?.sku || "").trim();

  return (
    <>
      <CrudTable<Product>
        key={publicationRevision}
        endpoint="/api/products"
        moduleKey="products"
        serverExcelExport="/api/products/export"
        searchPlaceholder="搜尋 SKU / 商品名稱 / 條碼"
        enableDateFilter={true}
        inlineEdit={false}
        enableEnterToCreate={true}
        canEdit={true}
        columns={[
          {
            key: "imageUrl",
            title: "圖片",
            isImage: true,
            render: (r) => r.imageUrl ? (
              <img
                src={r.imageUrl}
                alt={r.name}
                className="w-12 h-12 object-cover rounded cursor-pointer hover:ring-2 hover:ring-ring transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  if (r.imageUrl) setEnlargedImage(r.imageUrl);
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">無</div>
            )
          },
          { key: "sku", title: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span>, editable: { type: "text" }, csv: (r) => r.sku },
          { key: "name", title: "商品名稱", editable: { type: "text" }, csv: (r) => r.name },
          { key: "spec", title: "規格", editable: { type: "text" }, csv: (r) => r.spec ?? "" },
          {
            key: "barcode",
            title: "條碼／標籤",
            csv: (r) => r.barcode ?? "",
            render: (r) => (
              <div className="flex min-w-[190px] items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">{r.barcode || r.sku}</div>
                  <div className="text-[10px] text-muted-foreground">{r.barcode ? "商品條碼" : "未填條碼，使用 SKU"}</div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    openBarcodePrinter(r);
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />列印
                </Button>
              </div>
            ),
          },
          { key: "costPrice", title: "成本", render: (r) => formatMoney(r.costPrice), editable: { type: "number" }, csv: (r) => Number(r.costPrice) },
          { key: "salePrice", title: "售價", render: (r) => formatMoney(r.salePrice), editable: { type: "number" }, csv: (r) => Number(r.salePrice) },
          { key: "safetyStock", title: "安全庫存", render: (r) => formatNumber(Number(r.safetyStock)), editable: { type: "number" }, csv: (r) => Number(r.safetyStock) },
          {
            key: "stockTotal",
            title: "剩餘庫存",
            render: (r) => {
              const stock = Number(r.stockTotal ?? 0);
              const safe = Number(r.safetyStock);
              return (
                <span className={stock < safe ? "text-red-600 font-medium" : "text-emerald-600"}>
                  {formatNumber(stock)}
                </span>
              );
            },
          },
          {
            key: "soldTotal",
            title: "已售出",
            render: (r) => <span className="text-blue-600">{formatNumber(Number(r.soldTotal ?? 0))}</span>,
          },
          {
            key: "alert",
            title: "庫存警示",
            render: (r) => {
              const stock = Number(r.stockTotal ?? 0);
              const safe = Number(r.safetyStock);
              if (stock <= 0) return <Badge variant="danger">缺貨</Badge>;
              if (stock < safe) return <Badge variant="warning">低庫存</Badge>;
              return <Badge variant="success">正常</Badge>;
            },
          },
          { key: "isActive", title: "狀態", render: (r) => (r.isActive ? <Badge variant="success">啟用</Badge> : <Badge variant="danger">停用</Badge>) },
          ...(isCommerce ? [{
            key: "isPublished",
            title: "一般消費者官網",
            render: (r: Product) => (
              <button
                type="button"
                onClick={async (event) => {
                  event.stopPropagation();
                  const response = await fetch(`/api/products/${r.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ isPublished: !r.isPublished }),
                  });
                  const result = await response.json();
                  if (!response.ok) return toast.error(result.error || "官網上架狀態更新失敗");
                  toast.success(r.isPublished ? "商品已從官網下架" : "商品已上架至官網");
                  setPublicationRevision((value) => value + 1);
                }}
                className={r.isPublished ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100" : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"}
              >
                {r.isPublished ? "官網上架中" : "官網已下架"}
              </button>
            ),
          }] : []),
          { key: "updatedBy", title: "操作人員", render: (r) => <span className="text-xs text-gray-500">{r.updatedBy || "-"}</span> },
        ]}
        FormDialog={(props: any) => <ProductDialog {...props} isCommerce={isCommerce} />}
        pdfTitle="商品管理"
        exportName="商品管理"
        templateHeaders={["SKU", "商品名稱", "規格", "條碼", "單位", "成本", "售價", "庫存", "安全庫存", "圖片URL"]}
        importMap={(r) => ({
          sku: String(r["SKU"] ?? r.sku ?? "").trim(),
          name: String(r["商品名稱"] ?? r.name ?? "").trim(),
          spec: String(r["規格"] ?? r.spec ?? "").trim(),
          unit: String(r["單位"] ?? r.unit ?? "個").trim() || "個",
          costPrice: Number(r["成本"] ?? r.costPrice ?? 0),
          salePrice: Number(r["售價"] ?? r.salePrice ?? 0),
          stockQty: r["庫存"] != null ? Number(r["庫存"]) : undefined,
          safetyStock: Number(r["安全庫存"] ?? r.safetyStock ?? 0),
          barcode: String(r["條碼"] ?? r.barcode ?? "").trim() || undefined,
          imageUrl: String(r["圖片URL"] ?? r.imageUrl ?? "").trim() || undefined,
        })}
      />

      <Dialog open={!!barcodeProduct} onOpenChange={(next) => !next && setBarcodeProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Barcode className="h-5 w-5" />列印商品條碼標籤</DialogTitle>
          </DialogHeader>
          {barcodeProduct && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-white p-4 text-black shadow-sm">
                <div className="truncate text-sm font-bold">{barcodeProduct.name}</div>
                {barcodeProduct.spec && <div className="truncate text-xs text-gray-600">{barcodeProduct.spec}</div>}
                <div className="my-2"><BarcodePreview value={barcodePreviewValue} /></div>
                <div className="flex items-end justify-between gap-3">
                  <span className="truncate font-mono text-xs">{barcodePreviewValue}</span>
                  <strong>{formatMoney(barcodeProduct.salePrice)}</strong>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>標籤尺寸</Label>
                  <select
                    value={labelSize}
                    onChange={(event) => setLabelSize(event.target.value as LabelSize)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Object.entries(LABEL_SIZES).map(([value, size]) => <option key={value} value={value}>{size.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>列印張數</Label>
                  <Input type="number" min="1" max="200" value={labelQuantity} onChange={(event) => setLabelQuantity(event.target.value)} />
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                條碼採 Code 128 格式，內容使用商品「條碼」欄位；若未填條碼會自動使用 SKU。列印後可直接由 POS 的 F2 掃碼欄位讀取。
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBarcodeProduct(null)}>取消</Button>
            <Button onClick={printBarcodeLabels}><Printer className="h-4 w-4" />開啟列印</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 圖片放大模態框 */}
      <Dialog open={!!enlargedImage} onOpenChange={() => setEnlargedImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>商品圖片</DialogTitle>
          </DialogHeader>
          {enlargedImage && (
            <div className="flex items-center justify-center">
              <img src={enlargedImage} alt="放大圖片" className="max-w-full max-h-[70vh] object-contain" />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setEnlargedImage(null)}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
