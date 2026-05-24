"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Search, Download, FileDown, Printer, Pencil } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { TableHint, useColumnDrag } from "@/components/table-helpers";

type QuotationItem = {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discount: number | string;
  taxRate: number | string;
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
    setItems([...items, { productId: "", quantity: "", unitPrice: "", discount: "", taxRate: "", subtotal: 0 }]);
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
      const res = await fetch(row ? `/api/quotations/${row.id}` : "/api/quotations", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: row?.id, items }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const saved = await res.json();
      toast.success("已儲存");
      onSaved(saved);
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
                  <option value="SUBMITTED">已送審</option>
                  <option value="APPROVED">已審核</option>
                  <option value="POSTED">已過帳</option>
                  <option value="VOIDED">已作廢</option>
                  <option value="REJECTED">已駁回</option>
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
                      <TD><Input type="number" step="1" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="w-20" /></TD>
                      <TD><Input type="number" step="1" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} className="w-24" /></TD>
                      <TD><Input type="number" step="1" value={item.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} className="w-20" /></TD>
                      <TD><Input type="number" step="1" value={item.taxRate} onChange={(e) => updateItem(idx, "taxRate", e.target.value)} className="w-16" /></TD>
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
  const [editId, setEditId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const customCols = useCustomColumns("quotations");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const colDrag = useColumnDrag("quotations", ["number", "customer", "date", "validUntil", "total", "status", "updatedBy"]);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);

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

  const editableFields = ["quoteDate", "validUntil"];

  async function onAct(id: string, action: string) {
    try {
      const res = await fetch("/api/quotations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      toast.success("已處理");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function startCellEdit(row: any, colKey: string) {
    if (!inlineEditing[row.id]) {
      const draft: Record<string, any> = {};
      editableFields.forEach((f) => { draft[f] = (row as any)[f] ?? ""; });
      setInlineEditing((prev) => ({ ...prev, [row.id]: draft }));
    }
    setActiveCell({ rowId: row.id, colKey });
  }

  function handleCellKeyDown(e: React.KeyboardEvent, row: any, colKey: string) {
    const rowIdx = items.findIndex((r) => r.id === row.id);
    const colIdx = editableFields.indexOf(colKey);
    if (editableFields.length === 0 || colIdx === -1) return;

    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      saveCellAndMove(row, rowIdx + 1, colKey);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      saveCellAndMove(row, rowIdx - 1, colKey);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      if (colIdx < editableFields.length - 1) {
        setActiveCell({ rowId: row.id, colKey: editableFields[colIdx + 1] });
      } else if (rowIdx < items.length - 1) {
        saveCellAndMove(row, rowIdx + 1, editableFields[0]);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      if (colIdx > 0) {
        setActiveCell({ rowId: row.id, colKey: editableFields[colIdx - 1] });
      } else if (rowIdx > 0) {
        saveCellAndMove(row, rowIdx - 1, editableFields[editableFields.length - 1]);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        if (colIdx > 0) {
          setActiveCell({ rowId: row.id, colKey: editableFields[colIdx - 1] });
        } else if (rowIdx > 0) {
          saveCellAndMove(row, rowIdx - 1, editableFields[editableFields.length - 1]);
        }
      } else {
        if (colIdx < editableFields.length - 1) {
          setActiveCell({ rowId: row.id, colKey: editableFields[colIdx + 1] });
        } else if (rowIdx < items.length - 1) {
          saveCellAndMove(row, rowIdx + 1, editableFields[0]);
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelInlineEdit(row.id);
      setActiveCell(null);
    }
  }

  async function saveCellAndMove(currentRow: any, targetRowIdx: number, targetColKey: string) {
    await saveInlineEdit(currentRow);
    if (targetRowIdx >= 0 && targetRowIdx < items.length) {
      const targetRow = items[targetRowIdx];
      startCellEdit(targetRow, targetColKey);
    } else {
      setActiveCell(null);
    }
  }

  async function saveInlineEdit(row: any) {
    const draft = inlineEditing[row.id];
    if (!draft) return;
    setInlineSaving(row.id);
    try {
      const payload = { ...(row as any), ...draft };
      const res = await fetch(`/api/quotations/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const saved = await res.json().catch(() => null);
      toast.success("已儲存");
      setInlineEditing((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      setItems((prev) => prev.map((r) => r.id === row.id ? (saved && saved.id ? saved : { ...r, ...draft }) : r));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInlineSaving(null);
    }
  }

  function cancelInlineEdit(rowId: string) {
    setInlineEditing((prev) => { const n = { ...prev }; delete n[rowId]; return n; });
    if (activeCell?.rowId === rowId) setActiveCell(null);
  }

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
        <CustomColumnButton onClick={() => customCols.setOpen(true)} />
      </div>

      <TableHint />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <Table>
          <THead>
            <TR><TH {...colDrag.thProps("number")}>單號</TH><TH {...colDrag.thProps("customer")}>客戶</TH><TH {...colDrag.thProps("date")}>日期</TH><TH {...colDrag.thProps("validUntil")}>有效期限</TH><TH {...colDrag.thProps("total")}>總計</TH><TH {...colDrag.thProps("status")}>狀態</TH><TH {...colDrag.thProps("updatedBy")}>操作人員</TH>{customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}<TH className="text-right">操作</TH></TR>
          </THead>
          <TBody>
            {items.length === 0 && <TR><TD colSpan={8} className="text-center text-muted-foreground">尚無報價單</TD></TR>}
            {items.map((q) => {
              const draft = inlineEditing[q.id];
              const isRowEditing = !!draft;
              return (
              <TR key={q.id} className={isRowEditing ? "bg-accent/5" : ""}>
                <TD className="font-mono text-xs">{q.number}</TD>
                <TD>{q.customer?.companyName}</TD>
                <TD
                  className={editableFields.includes("quoteDate") ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                  onClick={() => { if (editableFields.includes("quoteDate")) startCellEdit(q, "quoteDate"); }}
                >
                  {activeCell?.rowId === q.id && activeCell?.colKey === "quoteDate" ? (
                    <Input
                      type="date"
                      value={draft?.quoteDate ?? q.quoteDate?.slice(0, 10) ?? ""}
                      autoFocus
                      onChange={(e) => setInlineEditing((prev) => ({ ...prev, [q.id]: { ...prev[q.id], quoteDate: e.target.value } }))}
                      className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                      onKeyDown={(e) => handleCellKeyDown(e, q, "quoteDate")}
                    />
                  ) : (
                    formatDate(q.quoteDate)
                  )}
                </TD>
                <TD
                  className={editableFields.includes("validUntil") ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                  onClick={() => { if (editableFields.includes("validUntil")) startCellEdit(q, "validUntil"); }}
                >
                  {activeCell?.rowId === q.id && activeCell?.colKey === "validUntil" ? (
                    <Input
                      type="date"
                      value={draft?.validUntil ?? q.validUntil?.slice(0, 10) ?? ""}
                      autoFocus
                      onChange={(e) => setInlineEditing((prev) => ({ ...prev, [q.id]: { ...prev[q.id], validUntil: e.target.value } }))}
                      className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                      onKeyDown={(e) => handleCellKeyDown(e, q, "validUntil")}
                    />
                  ) : (
                    formatDate(q.validUntil)
                  )}
                </TD>
                <TD>{formatMoney(q.total)}</TD>
                <TD><StatusBadge status={q.status} /></TD>
                <TD className="text-xs text-gray-500">{q.updatedBy || "-"}</TD>
                {customCols.columns.map((cc) => {
                  const cellKey = `${q.id}_${cc.id}`;
                  const vals = getCustomFieldValues("quotations", q.id);
                  const isE = editingCells[cellKey];
                  return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={vals[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue("quotations", q.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [cellKey]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="inline-block min-h-[24px] min-w-[40px] cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted" onClick={() => setEditingCells((p) => ({ ...p, [cellKey]: true }))}>{vals[cc.id] || "—"}</span>}</TD>;
                })}
                <TD className="text-right">
                  {q.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => onAct(q.id, "submit")}>送出</Button>}
                  {q.status === "SUBMITTED" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onAct(q.id, "approve")}>審核</Button>
                      <Button size="sm" variant="destructive" onClick={() => onAct(q.id, "reject")}>駁回</Button>
                    </>
                  )}
                  {q.status === "APPROVED" && <Button size="sm" onClick={() => onAct(q.id, "post")}>過帳</Button>}
                  {q.status !== "VOIDED" && q.status !== "POSTED" && <Button size="sm" variant="destructive" onClick={() => onAct(q.id, "void")}>作廢</Button>}
                  <Button variant="ghost" size="icon" onClick={() => setEditId(q.id)} title="編輯">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title="刪除" onClick={async () => {
                    if (!confirm(`確定刪除 ${q.number}？`)) return;
                    const res = await fetch(`/api/quotations/${q.id}`, { method: "DELETE" });
                    if (!res.ok) { const e = await res.json(); toast.error(e.error || "刪除失敗"); return; }
                    toast.success("已刪除");
                    load();
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            );
            })}
          </TBody>
        </Table>
      )}

      <QuotationDialog open={openNew} onClose={() => setOpenNew(false)} onSaved={(saved: any) => { setOpenNew(false); if (saved) { setItems((prev) => prev.map((q) => q.id === saved.id ? saved : q)); } else { load(); } }} />
      {editId && <QuotationDialog open={!!editId} row={items.find((q) => q.id === editId)} onClose={() => setEditId(null)} onSaved={(saved: any) => { setEditId(null); if (saved) { setItems((prev) => prev.map((q) => q.id === saved.id ? saved : q)); } else { load(); } }} />}
      <CustomColumnDialog module="quotations" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}
