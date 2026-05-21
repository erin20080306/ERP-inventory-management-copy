"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Search, Download, FileDown, Printer } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";

type QuotationItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  subtotal: number;
};

function QuotationDialog({ open, onClose, row, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      Promise.all([
        fetch("/api/customers?pageSize=1000").then(r => r.json()),
        fetch("/api/products?pageSize=1000").then(r => r.json()),
      ]).then(([cRes, pRes]) => {
        setCustomers(cRes.items || []);
        setProducts(pRes.items || []);
        setLoading(false);
      });
      
      if (row) {
        setForm(row);
        setItems(row.items || []);
      } else {
        setForm({ status: "DRAFT", quoteDate: new Date().toISOString().slice(0, 10) });
        setItems([]);
      }
    }
  }, [open, row]);

  const addItem = () => {
    setItems([...items, { productId: "", quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, subtotal: 0 }]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems as any)[idx][field] = value;
    const qty = Number((newItems as any)[idx].quantity);
    const price = Number((newItems as any)[idx].unitPrice);
    const discount = Number((newItems as any)[idx].discount);
    const taxRate = Number((newItems as any)[idx].taxRate);
    const subtotal = (qty * price - discount) * (1 + taxRate / 100);
    (newItems as any)[idx].subtotal = subtotal;
    setItems(newItems);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  async function save() {
    if (!form.customerId) return toast.error("請選擇客戶");
    if (items.length === 0) return toast.error("請至少新增一項商品");
    setSaving(true);
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items }),
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
          <DialogTitle>報價單</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>客戶 *</Label>
                <select value={form.customerId || ""} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="w-full px-3 py-2 border rounded">
                  <option value="">請選擇</option>
                  {customers.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>報價日期</Label>
                <Input type="date" value={form.quoteDate?.slice(0, 10) || ""} onChange={(e) => setForm({ ...form, quoteDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>有效期限</Label>
                <Input type="date" value={form.validUntil?.slice(0, 10) || ""} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>狀態</Label>
                <select value={form.status || "DRAFT"} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border rounded">
                  <option value="DRAFT">草稿</option>
                  <option value="SENT">已送出</option>
                  <option value="ACCEPTED">已接受</option>
                  <option value="REJECTED">已拒絕</option>
                  <option value="EXPIRED">已過期</option>
                </select>
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
                    <TH>數量</TH>
                    <TH>單價</TH>
                    <TH>折扣</TH>
                    <TH>稅率%</TH>
                    <TH>小計</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((item, idx) => (
                    <TR key={idx}>
                      <TD>
                        <select value={item.productId} onChange={(e) => updateItem(idx, "productId", e.target.value)} className="w-full px-2 py-1 border rounded">
                          <option value="">請選擇</option>
                          {products.map((p: any) => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                        </select>
                      </TD>
                      <TD><Input type="number" step="0.01" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="w-20" /></TD>
                      <TD><Input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} className="w-24" /></TD>
                      <TD><Input type="number" step="0.01" value={item.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} className="w-20" /></TD>
                      <TD><Input type="number" step="0.01" value={item.taxRate} onChange={(e) => updateItem(idx, "taxRate", e.target.value)} className="w-16" /></TD>
                      <TD>{formatMoney(item.subtotal)}</TD>
                      <TD><Button size="sm" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-red-600" /></Button></TD>
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

export default function QuotationClient() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/quotations?${params}`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [q, fromDate, toDate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋單號 / 客戶" className="pl-9 w-72" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
        <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" />新增報價單</Button>
        <Button variant="outline" onClick={async () => {
          const res = await fetch(`/api/quotations?q=${encodeURIComponent(q)}&pageSize=10000`);
          const d = await res.json();
          const csv = toCSV(d.items, [
            { key: "number", title: "單號" },
            { key: "customer", title: "客戶", get: (r: any) => r.customer?.companyName ?? "" },
            { key: "quoteDate", title: "報價日期", get: (r: any) => formatDate(r.quoteDate) },
            { key: "validUntil", title: "有效期限", get: (r: any) => formatDate(r.validUntil) },
            { key: "total", title: "總計" },
            { key: "status", title: "狀態" },
          ]);
          downloadCSV(`quotations-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          toast.success("已匯出 CSV");
        }}><Download className="h-4 w-4" />CSV</Button>
        <Button variant="outline" onClick={async () => {
          const res = await fetch(`/api/quotations?q=${encodeURIComponent(q)}&pageSize=10000`);
          const d = await res.json();
          const flat: any[] = [];
          d.items.forEach((j: any) => {
            j.items.forEach((l: any) => flat.push({
              number: j.number, customer: j.customer?.companyName, date: formatDate(j.quoteDate), valid: formatDate(j.validUntil),
              product: l.productId, qty: l.quantity, price: l.unitPrice, subtotal: l.subtotal, status: j.status,
            }));
          });
          const { downloadExcel } = await import("@/lib/excel");
          downloadExcel("quotations", "報價單", flat, [
            { key: "number", title: "單號" },
            { key: "customer", title: "客戶" },
            { key: "date", title: "報價日期" },
            { key: "valid", title: "有效期限" },
            { key: "product", title: "商品" },
            { key: "qty", title: "數量" },
            { key: "price", title: "單價" },
            { key: "subtotal", title: "小計" },
            { key: "status", title: "狀態" },
          ]);
          toast.success("已匯出 Excel");
        }}><FileDown className="h-4 w-4" />Excel</Button>
        <Button variant="outline" disabled={pdfBusy} onClick={async () => {
          setPdfBusy(true);
          try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF("報價單", "quotations"); } finally { setPdfBusy(false); }
        }}>
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          PDF
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <Table>
          <THead>
            <TR><TH>單號</TH><TH>客戶</TH><TH>日期</TH><TH>有效期限</TH><TH>總計</TH><TH>狀態</TH></TR>
          </THead>
          <TBody>
            {items.length === 0 && <TR><TD colSpan={6} className="text-center text-muted-foreground">尚無報價單</TD></TR>}
            {items.map((q) => (
              <TR key={q.id}>
                <TD className="font-mono text-xs">{q.number}</TD>
                <TD>{q.customer?.companyName}</TD>
                <TD>{formatDate(q.quoteDate)}</TD>
                <TD>{formatDate(q.validUntil)}</TD>
                <TD>{formatMoney(q.total)}</TD>
                <TD><StatusBadge status={q.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <QuotationDialog open={openNew} onClose={() => setOpenNew(false)} onSaved={load} />
    </div>
  );
}
