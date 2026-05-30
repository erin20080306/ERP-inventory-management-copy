"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Search, Printer, Pencil } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { ConvertToJournalButton } from "@/components/convert-to-journal-button";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { readSessionCache, TableHint, TableSkeletonRows, useColumnDrag, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";

type ReturnItem = {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discount: number | string;
  taxRate: number | string;
  subtotal: number;
};

function ReturnDialog({ open, onClose, row, onSaved, type }: any) {
  const [form, setForm] = useState<any>({});
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      Promise.all([
        fetch("/api/customers?pageSize=1000").then(r => r.json()),
        fetch("/api/suppliers?pageSize=1000").then(r => r.json()),
        fetch("/api/products?pageSize=1000").then(r => r.json()),
      ]).then(([cRes, sRes, pRes]) => {
        setCustomers(cRes.items || []);
        setSuppliers(sRes.items || []);
        setProducts(pRes.items || []);
        setLoading(false);
      });
      
      if (row) {
        setForm(row);
        setItems(row.items || []);
      } else {
        setForm({ status: "DRAFT" });
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
    // 自動計算小計
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
    if (type === "sales" && !form.customerId) return toast.error("請選擇客戶");
    if (type === "purchase" && !form.supplierId) return toast.error("請選擇供應商");
    if (items.length === 0) return toast.error("請至少新增一項商品");
    setSaving(true);
    try {
      const endpoint = type === "sales" ? "/api/returns/sales" : "/api/returns/purchases";
      const res = await fetch(row ? `${endpoint}/${row.id}` : endpoint, {
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
          <DialogTitle>{type === "sales" ? "銷售退貨" : "採購退貨"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {type === "sales" ? (
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
              <div className="space-y-1 col-span-2">
                <Label>原因</Label>
                <Textarea value={form.reason || ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
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

export default function ReturnsClient() {
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openSales, setOpenSales] = useState(false);
  const [openPurchase, setOpenPurchase] = useState(false);
  const [editSalesId, setEditSalesId] = useState<string | null>(null);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const customCols = useCustomColumns("returns");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const colDrag = useColumnDrag("returns", ["number", "party", "date", "reason", "total", "status", "updatedBy"]);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);

  function buildParams() {
    const params = new URLSearchParams({ q: debouncedQ });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params;
  }

  async function loadSalesReturns() {
    const params = buildParams();
    const cacheKey = `returns:sales:${params.toString()}`;
    const cached = readSessionCache<any[]>(cacheKey);
    if (cached) {
      setSalesReturns(cached);
      setSalesLoading(false);
    } else {
      setSalesLoading(true);
    }
    try {
      const res = await fetch(`/api/returns/sales?${params}`);
      const data = await res.json();
      const items = data.items || [];
      setSalesReturns(items);
      writeSessionCache(cacheKey, items);
    } finally {
      setSalesLoading(false);
    }
  }

  async function loadPurchaseReturns() {
    const params = buildParams();
    const cacheKey = `returns:purchases:${params.toString()}`;
    const cached = readSessionCache<any[]>(cacheKey);
    if (cached) {
      setPurchaseReturns(cached);
      setPurchaseLoading(false);
    } else {
      setPurchaseLoading(true);
    }
    try {
      const res = await fetch(`/api/returns/purchases?${params}`);
      const data = await res.json();
      const items = data.items || [];
      setPurchaseReturns(items);
      writeSessionCache(cacheKey, items);
    } finally {
      setPurchaseLoading(false);
    }
  }

  function load() {
    loadSalesReturns();
    loadPurchaseReturns();
  }

  useEffect(() => { load(); }, [debouncedQ, fromDate, toDate]);

  const editableFields = ["reason"];

  async function onAct(id: string, action: string, isSales: boolean) {
    try {
      const endpoint = isSales ? "/api/returns/sales" : "/api/returns/purchases";
      const res = await fetch(endpoint, {
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
    const allRows = [...salesReturns, ...purchaseReturns];
    const rowIdx = allRows.findIndex((r) => r.id === row.id);
    const colIdx = editableFields.indexOf(colKey);
    if (editableFields.length === 0 || colIdx === -1) return;

    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      saveCellAndMove(row, rowIdx + 1, colKey);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      saveCellAndMove(row, rowIdx - 1, colKey);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (colIdx < editableFields.length - 1) {
        setActiveCell({ rowId: row.id, colKey: editableFields[colIdx + 1] });
      } else if (rowIdx < allRows.length - 1) {
        saveCellAndMove(row, rowIdx + 1, editableFields[0]);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (colIdx > 0) {
        setActiveCell({ rowId: row.id, colKey: editableFields[colIdx - 1] });
      } else if (rowIdx > 0) {
        saveCellAndMove(row, rowIdx - 1, editableFields[editableFields.length - 1]);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx > 0) {
          setActiveCell({ rowId: row.id, colKey: editableFields[colIdx - 1] });
        } else if (rowIdx > 0) {
          saveCellAndMove(row, rowIdx - 1, editableFields[editableFields.length - 1]);
        }
      } else {
        if (colIdx < editableFields.length - 1) {
          setActiveCell({ rowId: row.id, colKey: editableFields[colIdx + 1] });
        } else if (rowIdx < allRows.length - 1) {
          saveCellAndMove(row, rowIdx + 1, editableFields[0]);
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelInlineEdit(row.id);
      setActiveCell(null);
    }
  }

  async function saveCellAndMove(currentRow: any, targetRowIdx: number, targetColKey: string) {
    await saveInlineEdit(currentRow);
    const allRows = [...salesReturns, ...purchaseReturns];
    if (targetRowIdx >= 0 && targetRowIdx < allRows.length) {
      const targetRow = allRows[targetRowIdx];
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
      const isSales = salesReturns.some((r) => r.id === row.id);
      const endpoint = isSales ? `/api/returns/sales/${row.id}` : `/api/returns/purchases/${row.id}`;
      const payload = { ...(row as any), ...draft };
      const res = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const saved = await res.json().catch(() => null);
      toast.success("已儲存");
      setInlineEditing((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      if (isSales) {
        setSalesReturns((prev) => prev.map((r) => r.id === row.id ? (saved && saved.id ? saved : { ...r, ...draft }) : r));
      } else {
        setPurchaseReturns((prev) => prev.map((r) => r.id === row.id ? (saved && saved.id ? saved : { ...r, ...draft }) : r));
      }
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
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋單號 / 客戶 / 供應商" className="pl-9 w-72" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
        <Button onClick={() => setOpenSales(true)}><Plus className="h-4 w-4 mr-1" />銷售退貨</Button>
        <Button onClick={() => setOpenPurchase(true)}><Plus className="h-4 w-4 mr-1" />採購退貨</Button>
        <Button variant="outline" disabled={pdfBusy} onClick={async () => {
          setPdfBusy(true);
          try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF("退貨管理", "returns"); } finally { setPdfBusy(false); }
        }}>
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          PDF
        </Button>
        <CustomColumnButton onClick={() => customCols.setOpen(true)} />
      </div>

      <TableHint />

      <div>
            <h3 className="text-lg font-semibold mb-3">銷售退貨</h3>
            <Table>
              <THead>
                <TR><TH {...colDrag.thProps("number")}>單號</TH><TH {...colDrag.thProps("party")}>客戶</TH><TH {...colDrag.thProps("date")}>日期</TH><TH {...colDrag.thProps("reason")}>原因</TH><TH {...colDrag.thProps("total")}>總計</TH><TH {...colDrag.thProps("status")}>狀態</TH><TH {...colDrag.thProps("updatedBy")}>操作人員</TH>{customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}<TH className="text-right">操作</TH></TR>
              </THead>
              <TBody>
                {salesLoading && salesReturns.length === 0 && <TableSkeletonRows columns={8 + customCols.columns.length} />}
                {!salesLoading && salesReturns.length === 0 && <TR><TD colSpan={8 + customCols.columns.length} className="text-center text-muted-foreground">尚無資料</TD></TR>}
                {salesReturns.map((r) => {
                  const draft = inlineEditing[r.id];
                  const isRowEditing = !!draft;
                  return (
                  <TR key={r.id} className={isRowEditing ? "bg-accent/5" : ""}>
                    <TD className="font-mono text-xs">{r.number}</TD>
                    <TD>{r.customer?.companyName}</TD>
                    <TD>{formatDate(r.returnDate)}</TD>
                    <TD
                      className={editableFields.includes("reason") ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                      onClick={() => { if (editableFields.includes("reason")) startCellEdit(r, "reason"); }}
                    >
                      {activeCell?.rowId === r.id && activeCell?.colKey === "reason" ? (
                        <Input
                          value={draft?.reason ?? r.reason ?? ""}
                          autoFocus
                          onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], reason: e.target.value } }))}
                          className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                          onKeyDown={(e) => handleCellKeyDown(e, r, "reason")}
                        />
                      ) : (
                        r.reason ?? "—"
                      )}
                    </TD>
                    <TD>{formatMoney(r.total)}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
                    {customCols.columns.map((cc) => { const ck = `${r.id}_${cc.id}`; const v = getCustomFieldValues("returns", r.id); const isE = editingCells[ck]; return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={v[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue("returns", r.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [ck]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="inline-block min-h-[24px] min-w-[40px] cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted" onClick={() => setEditingCells((p) => ({ ...p, [ck]: true }))}>{v[cc.id] || "—"}</span>}</TD>; })}
                    <TD className="text-right flex items-center justify-end gap-1">
                      {r.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => onAct(r.id, "submit", true)}>送出</Button>}
                      {r.status === "SUBMITTED" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => onAct(r.id, "approve", true)}>審核</Button>
                          <Button size="sm" variant="destructive" onClick={() => onAct(r.id, "reject", true)}>駁回</Button>
                        </>
                      )}
                      {r.status === "APPROVED" && <Button size="sm" onClick={() => onAct(r.id, "post", true)}>過帳</Button>}
                      {r.status !== "VOIDED" && r.status !== "POSTED" && <Button size="sm" variant="destructive" onClick={() => onAct(r.id, "void", true)}>作廢</Button>}
                      <Button variant="ghost" size="icon" onClick={() => setEditSalesId(r.id)} title="編輯">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title="刪除" onClick={async () => {
                        if (!confirm(`確定刪除 ${r.number}？`)) return;
                        const res = await fetch(`/api/returns/sales/${r.id}`, { method: "DELETE" });
                        if (!res.ok) { const e = await res.json(); toast.error(e.error || "刪除失敗"); return; }
                        toast.success("已刪除");
                        load();
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <ConvertToJournalButton sourceType="SALES_RETURN" sourceId={r.id} size="sm" />
                    </TD>
                  </TR>
                );
                })}
              </TBody>
            </Table>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">採購退貨</h3>
            <Table>
              <THead>
                <TR><TH {...colDrag.thProps("number")}>單號</TH><TH {...colDrag.thProps("party")}>供應商</TH><TH {...colDrag.thProps("date")}>日期</TH><TH {...colDrag.thProps("reason")}>原因</TH><TH {...colDrag.thProps("total")}>總計</TH><TH {...colDrag.thProps("status")}>狀態</TH><TH {...colDrag.thProps("updatedBy")}>操作人員</TH>{customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}<TH className="text-right">操作</TH></TR>
              </THead>
              <TBody>
                {purchaseLoading && purchaseReturns.length === 0 && <TableSkeletonRows columns={8 + customCols.columns.length} />}
                {!purchaseLoading && purchaseReturns.length === 0 && <TR><TD colSpan={8 + customCols.columns.length} className="text-center text-muted-foreground">尚無資料</TD></TR>}
                {purchaseReturns.map((r) => {
                  const draft = inlineEditing[r.id];
                  const isRowEditing = !!draft;
                  return (
                  <TR key={r.id} className={isRowEditing ? "bg-accent/5" : ""}>
                    <TD className="font-mono text-xs">{r.number}</TD>
                    <TD>{r.supplier?.companyName}</TD>
                    <TD>{formatDate(r.returnDate)}</TD>
                    <TD
                      className={editableFields.includes("reason") ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                      onClick={() => { if (editableFields.includes("reason")) startCellEdit(r, "reason"); }}
                    >
                      {activeCell?.rowId === r.id && activeCell?.colKey === "reason" ? (
                        <Input
                          value={draft?.reason ?? r.reason ?? ""}
                          autoFocus
                          onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], reason: e.target.value } }))}
                          className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                          onKeyDown={(e) => handleCellKeyDown(e, r, "reason")}
                        />
                      ) : (
                        r.reason ?? "—"
                      )}
                    </TD>
                    <TD>{formatMoney(r.total)}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
                    {customCols.columns.map((cc) => { const ck = `${r.id}_${cc.id}`; const v = getCustomFieldValues("returns", r.id); const isE = editingCells[ck]; return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={v[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue("returns", r.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [ck]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="inline-block min-h-[24px] min-w-[40px] cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted" onClick={() => setEditingCells((p) => ({ ...p, [ck]: true }))}>{v[cc.id] || "—"}</span>}</TD>; })}
                    <TD className="text-right flex items-center justify-end gap-1">
                      {r.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => onAct(r.id, "submit", false)}>送出</Button>}
                      {r.status === "SUBMITTED" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => onAct(r.id, "approve", false)}>審核</Button>
                          <Button size="sm" variant="destructive" onClick={() => onAct(r.id, "reject", false)}>駁回</Button>
                        </>
                      )}
                      {r.status === "APPROVED" && <Button size="sm" onClick={() => onAct(r.id, "post", false)}>過帳</Button>}
                      {r.status !== "VOIDED" && r.status !== "POSTED" && <Button size="sm" variant="destructive" onClick={() => onAct(r.id, "void", false)}>作廢</Button>}
                      <Button variant="ghost" size="icon" onClick={() => setEditPurchaseId(r.id)} title="編輯">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title="刪除" onClick={async () => {
                        if (!confirm(`確定刪除 ${r.number}？`)) return;
                        const res = await fetch(`/api/returns/purchases/${r.id}`, { method: "DELETE" });
                        if (!res.ok) { const e = await res.json(); toast.error(e.error || "刪除失敗"); return; }
                        toast.success("已刪除");
                        load();
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <ConvertToJournalButton sourceType="PURCHASE_RETURN" sourceId={r.id} size="sm" />
                    </TD>
                  </TR>
                );
                })}
              </TBody>
            </Table>
          </div>

      <ReturnDialog open={openSales} onClose={() => setOpenSales(false)} onSaved={(saved: any) => { setOpenSales(false); if (saved) { setSalesReturns((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} type="sales" />
      {editSalesId && <ReturnDialog open={!!editSalesId} row={salesReturns.find((r) => r.id === editSalesId)} onClose={() => setEditSalesId(null)} onSaved={(saved: any) => { setEditSalesId(null); if (saved) { setSalesReturns((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} type="sales" />}
      <ReturnDialog open={openPurchase} onClose={() => setOpenPurchase(false)} onSaved={(saved: any) => { setOpenPurchase(false); if (saved) { setPurchaseReturns((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} type="purchase" />
      {editPurchaseId && <ReturnDialog open={!!editPurchaseId} row={purchaseReturns.find((r) => r.id === editPurchaseId)} onClose={() => setEditPurchaseId(null)} onSaved={(saved: any) => { setEditPurchaseId(null); if (saved) { setPurchaseReturns((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} type="purchase" />}
      <CustomColumnDialog module="returns" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}
