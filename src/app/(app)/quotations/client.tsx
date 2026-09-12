"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Search, Download, FileDown, Printer, Pencil } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { useCustomColumns, useCustomFieldValues, CustomColumnDialog, CustomColumnButton, CustomFieldGridCell } from "@/components/custom-columns";
import { readSessionCache, TableHint, useColumnDrag, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";
import { useTranslations } from "next-intl";

type QuotationItem = {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discount: number | string;
  taxRate: number | string;
  subtotal: number;
};

async function fetchQuotationList(url: string) {
  const res = await fetch(url);
  const data = await res.json();
  // 這裡在元件外，拿不到翻譯；API 沒給訊息時留空，由呼叫端顯示已翻譯的預設文案。
  if (!res.ok) throw new Error(data.error || "");
  return data;
}

function TableSkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  const m = useTranslations("quotations");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TR key={rowIndex}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <TD key={colIndex}>
              <div className={`h-4 animate-pulse rounded bg-muted ${colIndex === 0 ? "h-10 w-10" : colIndex === columns - 1 ? "ml-auto w-20" : "w-full"}`} />
            </TD>
          ))}
        </TR>
      ))}
    </>
  );
}

function QuotationDialog({ open, onClose, row, onSaved }: any) {
  const m = useTranslations("quotations");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
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
    const subtotal = Math.round((qty * price - Math.round(discount)) * (1 + taxRate / 100));
    (newItems as any)[idx].subtotal = subtotal;
    setItems(newItems);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  async function save() {
    if (!form.customerId) return toast.error(m("customerRequired"));
    if (items.length === 0) return toast.error(m("itemsRequired"));
    setSaving(true);
    try {
      const res = await fetch(row ? `/api/quotations/${row.id}` : "/api/quotations", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: row?.id, items }),
      });
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      const saved = await res.json();
      toast.success(tc("saved"));
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
          <DialogTitle>{m("title")}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{f("customer")} *</Label>
                <select value={form.customerId || ""} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="w-full px-3 py-2 border rounded">
                  <option value="">{f("selectPlaceholder")}</option>
                  {customers.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{m("quoteDate")}</Label>
                <Input type="date" value={form.quoteDate?.slice(0, 10) || ""} onChange={(e) => setForm({ ...form, quoteDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{m("validUntil")}</Label>
                <Input type="date" value={form.validUntil?.slice(0, 10) || ""} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{tc("status")}</Label>
                <select value={form.status || "DRAFT"} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border rounded">
                  <option value="DRAFT">{f("draft")}</option>
                  <option value="SUBMITTED">{f("submitted")}</option>
                  <option value="APPROVED">{f("approvedState")}</option>
                  <option value="POSTED">{f("posted")}</option>
                  <option value="VOIDED">{f("voided")}</option>
                  <option value="REJECTED">{f("rejectedState")}</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>{m("items")}</Label>
                <Button size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" />{tc("create")}</Button>
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>{f("image")}</TH>
                    <TH>{f("product")}</TH>
                    <TH>{tc("quantity")}</TH>
                    <TH>{tc("unitPrice")}</TH>
                    <TH>{tc("discount")}</TH>
                    <TH>{m("taxRatePct")}</TH>
                    <TH>{tc("subtotal")}</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((item, idx) => {
                    const product = products.find((p: any) => p.id === item.productId);
                    return (
                    <TR key={idx}>
                      <TD>
                        {product?.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">-</div>
                        )}
                      </TD>
                      <TD>
                        <select value={item.productId} onChange={(e) => updateItem(idx, "productId", e.target.value)} className="w-full px-2 py-1 border rounded">
                          <option value="">{f("selectPlaceholder")}</option>
                          {products.map((p: any) => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                        </select>
                      </TD>
                      <TD><Input type="number" step="1" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="w-20" /></TD>
                      <TD><Input type="number" step="0.0001" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} className="w-24" /></TD>
                      <TD><Input type="number" step="1" value={item.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} className="w-20" /></TD>
                      <TD><Input type="number" step="1" value={item.taxRate} onChange={(e) => updateItem(idx, "taxRate", e.target.value)} className="w-16" /></TD>
                      <TD>{formatMoney(item.subtotal)}</TD>
                      <TD><Button size="sm" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-red-600" /></Button></TD>
                    </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>{tc("cancel")}</Button>
              <Button onClick={save} disabled={saving}>{saving ? tc("saving") : tc("save")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function QuotationClient() {
  const m = useTranslations("quotations");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const customCols = useCustomColumns("quotations");
  const colDrag = useColumnDrag("quotations", ["number", "customer", "date", "validUntil", "total", "status", "updatedBy"]);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);

  const tableKey = useMemo(() => {
    const params = new URLSearchParams({ q: debouncedQ, page: "1", pageSize: "20" });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return `/api/quotations?${params.toString()}`;
  }, [debouncedQ, fromDate, toDate]);
  const cachedData = useMemo(() => readSessionCache<any>(tableKey), [tableKey]);
  const { data, error, isLoading, isValidating, mutate: mutateList } = useSWR(tableKey, fetchQuotationList, {
    fallbackData: cachedData,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true,
    dedupingInterval: 15000,
    focusThrottleInterval: 30000,
    onSuccess: (nextData) => writeSessionCache(tableKey, nextData),
  });
  const items: any[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const customFieldValues = useCustomFieldValues("quotations", items.map((item) => item.id));
  const tableColumnCount = 9 + customCols.columns.length;
  const showInitialLoading = isLoading && !data;
  const showRefreshing = isValidating && !!data && !isLoading;
  function load() {
    void mutateList();
  }

  const editableFields = ["quoteDate", "validUntil"];

  async function onAct(id: string, action: string) {
    try {
      const res = await fetch("/api/quotations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || f("actionFailed"));
      toast.success(f("settled"));
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
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      const saved = await res.json().catch(() => null);
      toast.success(tc("saved"));
      setInlineEditing((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      mutateList((current: any) => {
        if (!current?.items) return current;
        return {
          ...current,
          items: current.items.map((r: any) => r.id === row.id ? (saved && saved.id ? saved : { ...r, ...draft }) : r),
        };
      }, { revalidate: false });
      void mutateList();
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
          <Input placeholder={m("searchPlaceholder")} className="pl-9 w-72" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
        <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" />{m("create")}</Button>
        <Button variant="outline" onClick={async () => {
          const res = await fetch(`/api/quotations?q=${encodeURIComponent(q)}&pageSize=10000`);
          const d = await res.json();
          const csv = toCSV(d.items, [
            { key: "number", title: f("docNo") },
            { key: "customer", title: f("customer"), get: (r: any) => r.customer?.companyName ?? "" },
            { key: "quoteDate", title: m("quoteDate"), get: (r: any) => formatDate(r.quoteDate) },
            { key: "validUntil", title: m("validUntil"), get: (r: any) => formatDate(r.validUntil) },
            { key: "total", title: tc("grandTotal") },
            { key: "status", title: tc("status") },
          ]);
          downloadCSV(`quotations-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          toast.success(tt("exportedCsv"));
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
          downloadExcel("quotations", m("title"), flat, [
            { key: "number", title: f("docNo") },
            { key: "customer", title: f("customer") },
            { key: "date", title: m("quoteDate") },
            { key: "valid", title: m("validUntil") },
            { key: "product", title: f("product") },
            { key: "qty", title: tc("quantity") },
            { key: "price", title: tc("unitPrice") },
            { key: "subtotal", title: tc("subtotal") },
            { key: "status", title: tc("status") },
          ]);
          toast.success(tt("exportedExcel"));
        }}><FileDown className="h-4 w-4" />Excel</Button>
        <Button variant="outline" disabled={pdfBusy} onClick={async () => {
          setPdfBusy(true);
          try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF(m("title"), "quotations"); } finally { setPdfBusy(false); }
        }}>
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          PDF
        </Button>
        <CustomColumnButton onClick={() => customCols.setOpen(true)} />
      </div>

      <TableHint />

      <Table>
        <THead onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("manageCustomColumns")}>
          <TR><TH>{f("image")}</TH><TH {...colDrag.thProps("number")}>{f("docNo")}</TH><TH {...colDrag.thProps("customer")}>{f("customer")}</TH><TH {...colDrag.thProps("date")}>{tc("date")}</TH><TH {...colDrag.thProps("validUntil")}>{m("validUntil")}</TH><TH {...colDrag.thProps("total")}>{tc("grandTotal")}</TH><TH {...colDrag.thProps("status")}>{tc("status")}</TH><TH {...colDrag.thProps("updatedBy")}>{f("updatedBy")}</TH>{customCols.columns.map((cc) => <TH key={cc.id} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("rightClickColumns")}>{cc.label}</TH>)}<TH className="text-right">{tc("actions")}</TH></TR>
        </THead>
        <TBody>
            {showInitialLoading && <TableSkeletonRows columns={tableColumnCount} />}
            {error && !showInitialLoading && items.length === 0 && <TR><TD colSpan={tableColumnCount} className="py-8 text-center text-sm text-destructive">{error.message || tt("dataLoadFailed")}</TD></TR>}
            {!showInitialLoading && !error && items.length === 0 && <TR><TD colSpan={tableColumnCount} className="text-center text-muted-foreground">{m("empty")}</TD></TR>}
            {!showInitialLoading && items.map((q, rowIndex) => {
              const draft = inlineEditing[q.id];
              const isRowEditing = !!draft;
              return (
              <TR key={q.id} className={isRowEditing ? "bg-accent/5" : ""}>
                <TD>
                  {(q.items?.[0]?.product as any)?.imageUrl ? (
                    <img src={(q.items?.[0]?.product as any)?.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">-</div>
                  )}
                </TD>
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
                      ref={(el) => { if (el) el.focus(); }}
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
                      ref={(el) => { if (el) el.focus(); }}
                    />
                  ) : (
                    formatDate(q.validUntil)
                  )}
                </TD>
                <TD>{formatMoney(q.total)}</TD>
                <TD><StatusBadge status={q.status} /></TD>
                <TD className="text-xs text-gray-500">{q.updatedBy || "-"}</TD>
                {customCols.columns.map((cc, columnIndex) => { const vals = customFieldValues.getValues(q.id); return <TD key={cc.id}><CustomFieldGridCell gridId="quotations" rowId={q.id} rowIndex={rowIndex} column={cc} columnIndex={columnIndex} rowIds={items.map((item) => item.id)} columns={customCols.columns} value={vals[cc.id] ?? ""} saveValues={customFieldValues.saveValues} onManageColumns={() => customCols.setOpen(true)} /></TD>; })}
                <TD className="text-right">
                  {q.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => onAct(q.id, "submit")}>{tc("submit")}</Button>}
                  {q.status === "SUBMITTED" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onAct(q.id, "approve")}>{tc("approve")}</Button>
                      <Button size="sm" variant="destructive" onClick={() => onAct(q.id, "reject")}>{tc("reject")}</Button>
                    </>
                  )}
                  {q.status === "APPROVED" && <Button size="sm" onClick={() => onAct(q.id, "post")}>{tc("post")}</Button>}
                  {q.status !== "VOIDED" && q.status !== "POSTED" && <Button size="sm" variant="destructive" onClick={() => onAct(q.id, "void")}>{tc("void")}</Button>}
                  <Button variant="ghost" size="icon" onClick={() => setEditId(q.id)} title={tc("edit")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title={tc("delete")} onClick={async () => {
                    if (!confirm(tt("confirmDeleteNamed", { number: q.number }))) return;
                    const res = await fetch(`/api/quotations/${q.id}`, { method: "DELETE" });
                    if (!res.ok) { const e = await res.json(); toast.error(e.error || tc("deleteFailed")); return; }
                    toast.success(tc("deleted"));
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          {tt("totalRows", { total })}
          {showRefreshing && <span className="ml-2 text-xs text-muted-foreground">{tt("updating")}</span>}
        </div>
      </div>

      <QuotationDialog open={openNew} onClose={() => setOpenNew(false)} onSaved={() => { setOpenNew(false); load(); }} />
      {editId && <QuotationDialog open={!!editId} row={items.find((q) => q.id === editId)} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load(); }} />}
      <CustomColumnDialog module="quotations" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}
