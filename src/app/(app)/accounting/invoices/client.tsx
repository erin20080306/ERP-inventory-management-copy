"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Search, Download, FileText, Ban, Printer, FileDown, ScanLine } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { ConvertToJournalButton } from "@/components/convert-to-journal-button";

export function InvoiceClient() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [openFromSO, setOpenFromSO] = useState(false);
  const [openFromPO, setOpenFromPO] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pageSize = 20;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/accounting/invoices?${params.toString()}`);
      const d = await res.json();
      setRows(d.items);
      setTotal(d.total);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, fromDate, toDate]);

  async function voidInvoice(id: string) {
    if (!confirm("確定作廢這張發票？")) return;
    const res = await fetch(`/api/accounting/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void" }),
    });
    if (!res.ok) return toast.error((await res.json()).error || "操作失敗");
    toast.success("已作廢");
    load();
  }

  async function fetchAllInvoices() {
    const res = await fetch(`/api/accounting/invoices?q=${encodeURIComponent(q)}&pageSize=10000`);
    return (await res.json()).items;
  }

  async function exportExcel() {
    const items = await fetchAllInvoices();
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel("invoices", "發票管理", items, [
      { key: "invoiceDate", title: "日期", get: (r: any) => formatDate(r.invoiceDate) },
      { key: "type", title: "類型", get: (r: any) => (r.type === "SALES" ? "銷項" : "進項") },
      { key: "number", title: "發票號碼" },
      { key: "party", title: "對象", get: (r: any) => (r.customer ?? r.supplier)?.companyName ?? "" },
      { key: "amountExTax", title: "未稅金額", get: (r: any) => Number(r.amountExTax) },
      { key: "taxAmount", title: "稅額", get: (r: any) => Number(r.taxAmount) },
      { key: "totalAmount", title: "含稅金額", get: (r: any) => Number(r.totalAmount) },
      { key: "status", title: "狀態" },
      { key: "remark", title: "備註" },
    ]);
    toast.success("已匯出 Excel");
  }

  async function exportCSV() {
    const res = await fetch(`/api/accounting/invoices?q=${encodeURIComponent(q)}&pageSize=10000`);
    const d = await res.json();
    const csv = toCSV(d.items, [
      { key: "invoiceDate", title: "日期", get: (r: any) => formatDate(r.invoiceDate) },
      { key: "type", title: "類型", get: (r: any) => (r.type === "SALES" ? "銷項" : "進項") },
      { key: "number", title: "發票號碼" },
      { key: "party", title: "對象", get: (r: any) => (r.customer ?? r.supplier)?.companyName ?? "" },
      { key: "amountExTax", title: "未稅金額" },
      { key: "taxAmount", title: "稅額" },
      { key: "totalAmount", title: "含稅金額" },
      { key: "status", title: "狀態" },
      { key: "remark", title: "備註" },
    ]);
    downloadCSV(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜尋發票號 / 對象" className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
          <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" disabled={pdfBusy} onClick={async () => {
            setPdfBusy(true);
            try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF("發票管理", "invoices"); } finally { setPdfBusy(false); }
          }}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />列印</Button>
          <Button variant="outline" onClick={exportExcel}><FileDown className="h-4 w-4" />Excel</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4" />CSV</Button>
          <Button variant="outline" onClick={() => window.location.href = "/accounting/invoices/tracks"}><FileText className="h-4 w-4" />字軌管理</Button>
          <Button variant="outline" onClick={() => window.location.href = "/accounting/invoices/scan"}><ScanLine className="h-4 w-4" />掃描發票</Button>
          <Button variant="outline" onClick={() => setOpenFromSO(true)}><FileText className="h-4 w-4" />由銷售單開立</Button>
          <Button variant="outline" onClick={() => setOpenFromPO(true)}><FileText className="h-4 w-4" />由採購單開立</Button>
          <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" />新增發票</Button>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>日期</TH><TH>類型</TH><TH>發票號碼</TH><TH>對象</TH><TH>未稅</TH><TH>稅額</TH><TH>含稅</TH><TH>狀態</TH><TH className="w-20 text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={9} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
          {!loading && rows.length === 0 && <TR><TD colSpan={9}><EmptyState /></TD></TR>}
          {!loading && rows.map((i) => (
            <TR key={i.id}>
              <TD>{formatDate(i.invoiceDate)}</TD>
              <TD><Badge variant={i.type === "SALES" ? "success" : "info"}>{i.type === "SALES" ? "銷項" : "進項"}</Badge></TD>
              <TD className="font-mono text-xs">{i.number}</TD>
              <TD>{(i.customer ?? i.supplier)?.companyName ?? "—"}</TD>
              <TD>{formatMoney(i.amountExTax)}</TD>
              <TD>{formatMoney(i.taxAmount)}</TD>
              <TD className="font-medium">{formatMoney(i.totalAmount)}</TD>
              <TD><StatusBadge status={i.status} /></TD>
              <TD className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {i.status !== "VOID" && <ConvertToJournalButton sourceType="INVOICE" sourceId={i.id} size="sm" />}
                  <Button variant="ghost" size="icon" title="一般列印" onClick={() => window.open(`/print/invoice/${i.id}`, "_blank")}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="台灣電子發票格式" onClick={() => window.open(`/print/invoice-tw/${i.id}`, "_blank")}>
                    <FileText className="h-4 w-4 text-blue-600" />
                  </Button>
                  {i.status !== "VOID" && (
                    <Button variant="ghost" size="icon" onClick={() => voidInvoice(i.id)}>
                      <Ban className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>共 {total} 筆</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一頁</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一頁</Button>
        </div>
      </div>

      <NewInvoiceDialog open={openNew} onClose={() => setOpenNew(false)} onCreated={() => { setOpenNew(false); load(); }} />
      <FromOrderDialog kind="sales" open={openFromSO} onClose={() => setOpenFromSO(false)} onDone={() => { setOpenFromSO(false); load(); }} />
      <FromOrderDialog kind="purchase" open={openFromPO} onClose={() => setOpenFromPO(false)} onDone={() => { setOpenFromPO(false); load(); }} />
    </div>
  );
}

function NewInvoiceDialog({ open, onClose, onCreated }: any) {
  const [type, setType] = useState<"SALES" | "PURCHASE">("SALES");
  const [parties, setParties] = useState<any[]>([]);
  const [partyId, setPartyId] = useState("");
  const [number, setNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [items, setItems] = useState<any[]>([{ description: "", quantity: 1, unitPrice: 0, taxRate: 0.05 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType("SALES"); setPartyId(""); setNumber(""); setRemark("");
    setItems([{ description: "", quantity: 1, unitPrice: 0, taxRate: 0.05 }]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ep = type === "SALES" ? "/api/customers" : "/api/suppliers";
    fetch(`${ep}?pageSize=1000`).then((r) => r.json()).then((d) => setParties(d.items ?? []));
    setPartyId("");
  }, [type, open]);

  const amountExTax = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  const taxAmount = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice) * Number(i.taxRate ?? 0), 0);
  const total = amountExTax + taxAmount;

  function update(idx: number, patch: any) { const n = [...items]; n[idx] = { ...n[idx], ...patch }; setItems(n); }
  function add() { setItems([...items, { description: "", quantity: 1, unitPrice: 0, taxRate: 0.05 }]); }
  function remove(idx: number) { setItems(items.filter((_, i) => i !== idx)); }

  async function save() {
    if (!partyId) return toast.error(`請選擇${type === "SALES" ? "客戶" : "供應商"}`);
    if (items.some((i) => !i.description)) return toast.error("每項明細需填寫品名");
    setSaving(true);
    try {
      const res = await fetch("/api/accounting/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          number: number || undefined,
          invoiceDate,
          customerId: type === "SALES" ? partyId : undefined,
          supplierId: type === "PURCHASE" ? partyId : undefined,
          items,
          remark,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已建立");
      onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>新增發票</DialogTitle></DialogHeader>
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>類型</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="SALES">銷項</option>
              <option value="PURCHASE">進項</option>
            </select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{type === "SALES" ? "客戶" : "供應商"} *</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">請選擇</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.code} - {p.companyName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1"><Label>發票日期</Label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
          <div className="space-y-1 col-span-2"><Label>發票號碼（留空自動產生）</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="例：AA-12345678" /></div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">品名描述</th>
                <th className="p-2 w-20">數量</th>
                <th className="p-2 w-28">單價</th>
                <th className="p-2 w-20">稅率</th>
                <th className="p-2 w-28 text-right">小計</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2"><Input value={i.description} onChange={(e) => update(idx, { description: e.target.value })} /></td>
                  <td className="p-2"><Input type="number" value={i.quantity} onChange={(e) => update(idx, { quantity: Number(e.target.value) })} /></td>
                  <td className="p-2"><Input type="number" step="0.01" value={i.unitPrice} onChange={(e) => update(idx, { unitPrice: Number(e.target.value) })} /></td>
                  <td className="p-2"><Input type="number" step="0.01" value={i.taxRate} onChange={(e) => update(idx, { taxRate: Number(e.target.value) })} /></td>
                  <td className="p-2 text-right">{formatMoney(Number(i.quantity) * Number(i.unitPrice))}</td>
                  <td className="p-2"><Button variant="ghost" size="icon" onClick={() => remove(idx)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2"><Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" />新增明細</Button></div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-muted-foreground">未稅</div><div className="font-medium">{formatMoney(amountExTax)}</div></div>
          <div><div className="text-muted-foreground">稅額</div><div className="font-medium">{formatMoney(taxAmount)}</div></div>
          <div><div className="text-muted-foreground">含稅</div><div className="font-bold text-lg">{formatMoney(total)}</div></div>
        </div>

        <Textarea placeholder="備註" value={remark} onChange={(e) => setRemark(e.target.value)} />

        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FromOrderDialog({ kind, open, onClose, onDone }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [id, setId] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    const ep = kind === "sales" ? "/api/sales" : "/api/purchases";
    fetch(`${ep}?pageSize=1000`).then((r) => r.json()).then((d) => setOrders(d.items ?? []));
    setId("");
  }, [open, kind]);
  async function doIssue() {
    if (!id) return toast.error("請選擇單據");
    setSaving(true);
    try {
      const ep = kind === "sales" ? `/api/sales/${id}/invoice` : `/api/purchases/${id}/invoice`;
      const res = await fetch(ep, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "開立失敗");
      toast.success("已開立發票");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>由{kind === "sales" ? "銷售" : "採購"}單開立發票</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>選擇單據</Label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">請選擇</option>
            {orders
              .filter((o: any) => o.status !== "DRAFT" && o.status !== "CANCELLED")
              .map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.number} - {(kind === "sales" ? o.customer : o.supplier)?.companyName} - {formatMoney(o.total)}
                </option>
              ))}
          </select>
          <div className="text-xs text-muted-foreground">僅顯示草稿/已取消以外的單據</div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={doIssue} disabled={saving}>{saving ? "處理中..." : "開立"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
