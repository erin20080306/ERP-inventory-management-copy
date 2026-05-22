"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Search, Download, FileDown, Printer, Pencil } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { ConvertToJournalButton } from "@/components/convert-to-journal-button";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { TableHint, useColumnDrag } from "@/components/table-helpers";

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
                  <option value="CONFIRMED">確認（自動調整庫存）</option>
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

export default function ReturnsClient() {
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
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

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      
      const [sRes, pRes] = await Promise.all([
        fetch(`/api/returns/sales?${params}`),
        fetch(`/api/returns/purchases?${params}`),
      ]);
      const sData = await sRes.json();
      const pData = await pRes.json();
      setSalesReturns(sData.items || []);
      setPurchaseReturns(pData.items || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [q, fromDate, toDate]);

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

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <>
          <div>
            <h3 className="text-lg font-semibold mb-3">銷售退貨</h3>
            <Table>
              <THead>
                <TR><TH {...colDrag.thProps("number")}>單號</TH><TH {...colDrag.thProps("party")}>客戶</TH><TH {...colDrag.thProps("date")}>日期</TH><TH {...colDrag.thProps("reason")}>原因</TH><TH {...colDrag.thProps("total")}>總計</TH><TH {...colDrag.thProps("status")}>狀態</TH><TH {...colDrag.thProps("updatedBy")}>操作人員</TH>{customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}<TH className="text-right">操作</TH></TR>
              </THead>
              <TBody>
                {salesReturns.length === 0 && <TR><TD colSpan={8} className="text-center text-muted-foreground">尚無資料</TD></TR>}
                {salesReturns.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-xs">{r.number}</TD>
                    <TD>{r.customer?.companyName}</TD>
                    <TD>{formatDate(r.returnDate)}</TD>
                    <TD>{r.reason ?? "—"}</TD>
                    <TD>{formatMoney(r.total)}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
                    {customCols.columns.map((cc) => { const ck = `${r.id}_${cc.id}`; const v = getCustomFieldValues("returns", r.id); const isE = editingCells[ck]; return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={v[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue("returns", r.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [ck]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 px-1 py-0.5 rounded min-h-[24px] inline-block min-w-[40px]" onClick={() => setEditingCells((p) => ({ ...p, [ck]: true }))}>{v[cc.id] || "—"}</span>}</TD>; })}
                    <TD className="text-right flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditSalesId(r.id)} title="編輯">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConvertToJournalButton sourceType="SALES_RETURN" sourceId={r.id} size="sm" />
                    </TD>
                  </TR>
                ))}
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
                {purchaseReturns.length === 0 && <TR><TD colSpan={8} className="text-center text-muted-foreground">尚無資料</TD></TR>}
                {purchaseReturns.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-xs">{r.number}</TD>
                    <TD>{r.supplier?.companyName}</TD>
                    <TD>{formatDate(r.returnDate)}</TD>
                    <TD>{r.reason ?? "—"}</TD>
                    <TD>{formatMoney(r.total)}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
                    {customCols.columns.map((cc) => { const ck = `${r.id}_${cc.id}`; const v = getCustomFieldValues("returns", r.id); const isE = editingCells[ck]; return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={v[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue("returns", r.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [ck]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 px-1 py-0.5 rounded min-h-[24px] inline-block min-w-[40px]" onClick={() => setEditingCells((p) => ({ ...p, [ck]: true }))}>{v[cc.id] || "—"}</span>}</TD>; })}
                    <TD className="text-right flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditPurchaseId(r.id)} title="編輯">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConvertToJournalButton sourceType="PURCHASE_RETURN" sourceId={r.id} size="sm" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}

      <ReturnDialog open={openSales} onClose={() => setOpenSales(false)} onSaved={(saved: any) => { setOpenSales(false); if (saved) { setSalesReturns((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} type="sales" />
      {editSalesId && <ReturnDialog open={!!editSalesId} row={salesReturns.find((r) => r.id === editSalesId)} onClose={() => setEditSalesId(null)} onSaved={(saved: any) => { setEditSalesId(null); if (saved) { setSalesReturns((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} type="sales" />}
      <ReturnDialog open={openPurchase} onClose={() => setOpenPurchase(false)} onSaved={(saved: any) => { setOpenPurchase(false); if (saved) { setPurchaseReturns((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} type="purchase" />
      {editPurchaseId && <ReturnDialog open={!!editPurchaseId} row={purchaseReturns.find((r) => r.id === editPurchaseId)} onClose={() => setEditPurchaseId(null)} onSaved={(saved: any) => { setEditPurchaseId(null); if (saved) { setPurchaseReturns((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} type="purchase" />}
      <CustomColumnDialog module="returns" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}
