"use client";
import { useState, useEffect, useRef } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatMoney, formatNumber } from "@/lib/utils";
import { X } from "lucide-react";

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
  stockTotal?: number;
  soldTotal?: number;
  categoryId?: string | null;
  unitId?: string | null;
  updatedBy?: string | null;
};

function ProductDialog({ open, onClose, row, onSaved }: any) {
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
            <Input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
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
                  {uploading ? "上傳中..." : "上傳圖片"}
                </Button>
                <p className="text-xs text-muted-foreground">支援 JPG、PNG、WebP、GIF 格式，最大 2MB</p>
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
            啟用
          </label>
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

export function ProductClient() {
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  
  return (
    <>
      <CrudTable<Product>
        endpoint="/api/products"
        moduleKey="products"
        searchPlaceholder="搜尋 SKU / 商品名稱 / 條碼"
        enableDateFilter={true}
        inlineEdit={true}
        enableEnterToCreate={true}
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
                  setEnlargedImage(r.imageUrl);
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">無</div>
            )
          },
        { key: "sku", title: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span>, editable: { type: "text" } },
        { key: "name", title: "商品名稱", editable: { type: "text" } },
        { key: "spec", title: "規格", editable: { type: "text" } },
        { key: "costPrice", title: "成本", render: (r) => formatMoney(r.costPrice), editable: { type: "number" } },
        { key: "salePrice", title: "售價", render: (r) => formatMoney(r.salePrice), editable: { type: "number" } },
        { key: "safetyStock", title: "安全庫存", render: (r) => formatNumber(Number(r.safetyStock)), editable: { type: "number" } },
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
        { key: "updatedBy", title: "操作人員", render: (r) => <span className="text-xs text-gray-500">{r.updatedBy || "-"}</span> },
      ]}
      FormDialog={ProductDialog}
      pdfTitle="商品管理"
      exportName="products"
      templateHeaders={["SKU", "商品名稱", "規格", "單位", "成本", "售價", "庫存", "安全庫存", "條碼"]}
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
      })}
    />
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
