"use client";
import { useState, useEffect } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatMoney, formatNumber } from "@/lib/utils";

type Product = {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  spec?: string | null;
  costPrice: any;
  salePrice: any;
  safetyStock: any;
  isActive: boolean;
  stockTotal?: number;
  categoryId?: string | null;
  unitId?: string | null;
};

function ProductDialog({ open, onClose, row, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [autofillHint, setAutofillHint] = useState<string | null>(null);
  useEffect(() => {
    setForm(
      row ?? {
        sku: "",
        name: "",
        spec: "",
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
            <Input type="number" step="0.01" value={form.costPrice ?? 0} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>售價</Label>
            <Input type="number" step="0.01" value={form.salePrice ?? 0} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>安全庫存</Label>
            <Input type="number" step="1" value={form.safetyStock ?? 0} onChange={(e) => setForm({ ...form, safetyStock: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>圖片網址</Label>
            <Input value={form.imageUrl ?? ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
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
  return (
    <CrudTable<Product>
      endpoint="/api/products"
      moduleKey="products"
      searchPlaceholder="搜尋 SKU / 商品名稱 / 條碼"
      enableDateFilter={true}
      columns={[
        { key: "sku", title: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
        { key: "name", title: "商品名稱" },
        { key: "spec", title: "規格" },
        { key: "costPrice", title: "成本", render: (r) => formatMoney(r.costPrice) },
        { key: "salePrice", title: "售價", render: (r) => formatMoney(r.salePrice) },
        {
          key: "stockTotal",
          title: "庫存",
          render: (r) => {
            const stock = Number(r.stockTotal ?? 0);
            const safe = Number(r.safetyStock);
            return (
              <span className={stock < safe ? "text-red-600 font-medium" : ""}>
                {formatNumber(stock)}
              </span>
            );
          },
        },
        { key: "isActive", title: "狀態", render: (r) => (r.isActive ? <Badge variant="success">啟用</Badge> : <Badge variant="danger">停用</Badge>) },
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
  );
}
