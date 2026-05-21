"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Search, Download, FileDown, Printer } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { ConvertToJournalButton } from "@/components/convert-to-journal-button";

function DiscountDialog({ open, onClose, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      Promise.all([
        fetch("/api/customers?pageSize=1000").then(r => r.json()),
        fetch("/api/suppliers?pageSize=1000").then(r => r.json()),
      ]).then(([cRes, sRes]) => {
        setCustomers(cRes.items || []);
        setSuppliers(sRes.items || []);
        setLoading(false);
      });
      setForm({ type: "PURCHASE" });
    }
  }, [open]);

  async function save() {
    if (!form.type) return toast.error("請選擇折讓類型");
    if (form.type === "SALES" && !form.customerId) return toast.error("請選擇客戶");
    if (form.type === "PURCHASE" && !form.supplierId) return toast.error("請選擇供應商");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("請輸入折讓金額");
    setSaving(true);
    try {
      const res = await fetch("/api/discounts", {
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
      <DialogContent className="max-w-[95vw] md:max-w-md">
        <DialogHeader>
          <DialogTitle>折讓單</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>折讓類型 *</Label>
              <select value={form.type || ""} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border rounded">
                <option value="">請選擇</option>
                <option value="SALES">銷售折讓</option>
                <option value="PURCHASE">進貨折讓</option>
              </select>
            </div>
            {form.type === "SALES" ? (
              <div className="space-y-1">
                <Label>客戶 *</Label>
                <select value={form.customerId || ""} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="w-full px-3 py-2 border rounded">
                  <option value="">請選擇</option>
                  {customers.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>供應商 *</Label>
                <select value={form.supplierId || ""} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="w-full px-3 py-2 border rounded">
                  <option value="">請選擇</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label>折讓金額 *</Label>
              <Input type="number" step="0.01" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>原單號</Label>
              <Input value={form.relNumber || ""} onChange={(e) => setForm({ ...form, relNumber: e.target.value })} placeholder="關聯的銷售/採購單號" />
            </div>
            <div className="space-y-1">
              <Label>原因</Label>
              <Textarea value={form.reason || ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
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

export default function DiscountClient() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, q });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/discounts?${params}`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [type, q, fromDate, toDate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 border rounded">
          <option value="">全部類型</option>
          <option value="SALES">銷售折讓</option>
          <option value="PURCHASE">進貨折讓</option>
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋單號 / 原單號" className="pl-9 w-72" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
        <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" />新增折讓單</Button>
        <Button variant="outline" disabled={pdfBusy} onClick={async () => {
          setPdfBusy(true);
          try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF("折讓單", "discounts"); } finally { setPdfBusy(false); }
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
            <TR><TH>單號</TH><TH>類型</TH><TH>客戶/供應商</TH><TH>原單號</TH><TH>折讓金額</TH><TH>原因</TH><TH>日期</TH><TH className="text-right">操作</TH></TR>
          </THead>
          <TBody>
            {items.length === 0 && <TR><TD colSpan={8} className="text-center text-muted-foreground">尚無資料</TD></TR>}
            {items.map((item) => (
              <TR key={item.id}>
                <TD className="font-mono text-xs">{item.number}</TD>
                <TD>{item.type === "SALES" ? "銷售折讓" : "進貨折讓"}</TD>
                <TD>{item.type === "SALES" ? item.customer?.companyName : item.supplier?.companyName}</TD>
                <TD className="font-mono text-xs">{item.relNumber || "—"}</TD>
                <TD className="text-red-600">-{formatMoney(item.amount)}</TD>
                <TD>{item.reason || "—"}</TD>
                <TD>{formatDate(item.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <DiscountDialog open={openNew} onClose={() => setOpenNew(false)} onSaved={load} />
    </div>
  );
}
