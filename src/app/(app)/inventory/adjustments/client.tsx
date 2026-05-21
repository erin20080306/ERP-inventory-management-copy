"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

type Adjustment = {
  id: string;
  number: string;
  warehouse: { name: string };
  reason: string;
  status: string;
  createdAt: string;
  items: {
    id: string;
    product: { name: string; sku: string; costPrice: any };
    systemQty: any;
    actualQty: any;
    diff: any;
    remark?: string;
  }[];
};

function AdjustmentDialog({ open, onClose, onSaved }: any) {
  const [form, setForm] = useState<any>({ warehouseId: "", reason: "", status: "DRAFT", items: [] });
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      Promise.all([
        fetch("/api/warehouses").then(r => r.json()),
        fetch("/api/products?pageSize=1000").then(r => r.json()),
      ]).then(([wRes, pRes]) => {
        setWarehouses(wRes.items || []);
        setProducts(pRes.items || []);
        setLoading(false);
      });
      setForm({ warehouseId: "", reason: "", status: "DRAFT", items: [] });
    }
  }, [open]);

  const addItem = () => {
    setForm((f: any) => ({ ...f, items: [...f.items, { productId: "", systemQty: 0, actualQty: 0, diff: 0, remark: "" }] }));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...form.items];
    newItems[idx][field] = value;
    
    // 自動計算 diff
    if (field === "systemQty" || field === "actualQty") {
      const systemQty = Number(newItems[idx].systemQty || 0);
      const actualQty = Number(newItems[idx].actualQty || 0);
      newItems[idx].diff = actualQty - systemQty;
    }
    
    setForm((f: any) => ({ ...f, items: newItems }));
  };

  const removeItem = (idx: number) => {
    setForm((f: any) => ({ ...f, items: f.items.filter((_: any, i: number) => i !== idx) }));
  };

  async function save() {
    if (!form.warehouseId) return toast.error("請選擇倉庫");
    if (!form.reason) return toast.error("請填寫原因");
    if (form.items.length === 0) return toast.error("請至少新增一項商品");
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/adjustments", {
        method: "POST",
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
      <DialogContent className="max-w-[95vw] md:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>盤點調整單</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>倉庫 *</Label>
                <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full px-3 py-2 border rounded">
                  <option value="">請選擇</option>
                  {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>狀態</Label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border rounded">
                  <option value="DRAFT">草稿</option>
                  <option value="CONFIRMED">確認（自動切傳票）</option>
                </select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label>原因 *</Label>
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>商品明細</Label>
                <Button size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" />新增</Button>
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>商品</TH>
                    <TH>系統數量</TH>
                    <TH>實際數量</TH>
                    <TH>差異</TH>
                    <TH>備註</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {form.items.map((item: any, idx: number) => (
                    <TR key={idx}>
                      <TD>
                        <select value={item.productId} onChange={(e) => updateItem(idx, "productId", e.target.value)} className="w-full px-2 py-1 border rounded">
                          <option value="">請選擇</option>
                          {products.map((p: any) => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                        </select>
                      </TD>
                      <TD>
                        <Input type="number" step="0.01" value={item.systemQty} onChange={(e) => updateItem(idx, "systemQty", e.target.value)} className="w-24" />
                      </TD>
                      <TD>
                        <Input type="number" step="0.01" value={item.actualQty} onChange={(e) => updateItem(idx, "actualQty", e.target.value)} className="w-24" />
                      </TD>
                      <TD className={Number(item.diff) > 0 ? "text-emerald-600" : Number(item.diff) < 0 ? "text-red-600" : ""}>
                        {formatNumber(item.diff)}
                      </TD>
                      <TD>
                        <Input value={item.remark} onChange={(e) => updateItem(idx, "remark", e.target.value)} className="w-full" />
                      </TD>
                      <TD>
                        <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdjustmentClient() {
  const [items, setItems] = useState<Adjustment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [openNew, setOpenNew] = useState(false);
  const pageSize = 20;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/adjustments?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" />新增盤點調整</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
          <THead>
            <TR><TH>單號</TH><TH>倉庫</TH><TH>原因</TH><TH>狀態</TH><TH>日期</TH></TR>
          </THead>
          <TBody>
            {items.map((adj) => (
              <TR key={adj.id}>
                <TD className="font-mono text-xs">{adj.number}</TD>
                <TD>{adj.warehouse.name}</TD>
                <TD>{adj.reason}</TD>
                <TD><StatusBadge status={adj.status} /></TD>
                <TD>{formatDate(adj.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        </div>
      )}

      <AdjustmentDialog open={openNew} onClose={() => setOpenNew(false)} onSaved={load} />
    </div>
  );
}
