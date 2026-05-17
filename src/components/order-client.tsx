"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Eye, Search, Download, Printer, FileDown, Pencil } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { ConvertToJournalButton } from "@/components/convert-to-journal-button";

function PDFOrderBtn({ kind }: { kind: string }) {
  const [busy, setBusy] = useState(false);
  const title = kind === "purchase" ? "採購管理" : "銷售管理";
  return (
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF(title, `${kind}-orders`); } finally { setBusy(false); }
    }}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      PDF
    </Button>
  );
}

type Kind = "purchase" | "sales";

type OrderRow = {
  id: string;
  number: string;
  status: string;
  total: any;
  orderDate: string;
  supplier?: { companyName: string };
  customer?: { companyName: string };
};

export function OrderClient({ kind }: { kind: Kind }) {
  const endpoint = kind === "purchase" ? "/api/purchases" : "/api/sales";
  const partyLabel = kind === "purchase" ? "供應商" : "客戶";
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [openView, setOpenView] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState<string | null>(null);
  const pageSize = 20;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      setRows(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder={`搜尋單號 / ${partyLabel}`} className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&pageSize=10000`);
              const d = await res.json();
              const csv = toCSV(d.items, [
                { key: "number", title: "單號" },
                { key: "party", title: partyLabel, get: (r: any) => (kind === "purchase" ? r.supplier : r.customer)?.companyName ?? "" },
                { key: "orderDate", title: "日期", get: (r: any) => formatDate(r.orderDate) },
                { key: "subtotal", title: "小計" },
                { key: "discount", title: "折扣" },
                { key: "taxAmount", title: "稅額" },
                { key: "total", title: "總計" },
                { key: "status", title: "狀態" },
              ]);
              downloadCSV(`${kind}-orders-${new Date().toISOString().slice(0, 10)}.csv`, csv);
              toast.success("已匯出 CSV");
            }}
          >
            <Download className="h-4 w-4" />
            匯出 CSV
          </Button>
          <PDFOrderBtn kind={kind} />
          <Button variant="outline" onClick={async () => {
            const params = new URLSearchParams({ q, pageSize: "10000" });
            const res = await fetch(`${endpoint}?${params}`);
            const d = await res.json();
            const { downloadExcel } = await import("@/lib/excel");
            downloadExcel(`${kind}-orders`, kind === "purchase" ? "採購單" : "銷售單", d.items, [
              { key: "number", title: "單號" },
              { key: "party", title: kind === "purchase" ? "供應商" : "客戶", get: (r: any) => (kind === "purchase" ? r.supplier : r.customer)?.companyName ?? "" },
              { key: "orderDate", title: "日期", get: (r: any) => formatDate(r.orderDate) },
              { key: "total", title: "總計", get: (r: any) => Number(r.total) },
              { key: "status", title: "狀態" },
            ]);
            toast.success("已匯出 Excel");
          }}>
            <FileDown className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            列印
          </Button>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4" />
            新增{kind === "purchase" ? "採購單" : "銷售單"}
          </Button>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>單號</TH>
            <TH>{partyLabel}</TH>
            <TH>日期</TH>
            <TH>金額</TH>
            <TH>狀態</TH>
            <TH className="w-20 text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && (
            <TR>
              <TD colSpan={6} className="text-center py-10">
                <Loader2 className="h-5 w-5 animate-spin inline-block" />
              </TD>
            </TR>
          )}
          {!loading && rows.length === 0 && (
            <TR>
              <TD colSpan={6}>
                <EmptyState />
              </TD>
            </TR>
          )}
          {!loading &&
            rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.number}</TD>
                <TD>{(kind === "purchase" ? r.supplier : r.customer)?.companyName ?? "—"}</TD>
                <TD>{formatDate(r.orderDate)}</TD>
                <TD>{formatMoney(r.total)}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD className="text-right flex items-center justify-end gap-0">
                  <Button variant="ghost" size="icon" onClick={() => setOpenView(r.id)} title="查看">
                    <Eye className="h-4 w-4" />
                  </Button>
                  {(r.status === "DRAFT" || r.status === "CONFIRMED" || r.status === "SUBMITTED") && (
                    <Button variant="ghost" size="icon" onClick={() => setOpenEdit(r.id)} title="修改">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {(r.status === "DRAFT" || r.status === "CONFIRMED" || r.status === "SUBMITTED" || r.status === "CANCELLED") && (
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title="刪除" onClick={async () => {
                      if (!confirm(`確定刪除 ${r.number}？`)) return;
                      const res = await fetch(`${endpoint}/${r.id}`, { method: "DELETE" });
                      if (!res.ok) { const e = await res.json(); toast.error(e.error || "刪除失敗"); return; }
                      toast.success("已刪除");
                      load();
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
        </TBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>共 {total} 筆</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一頁</Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一頁</Button>
        </div>
      </div>

      <CreateOrderDialog
        kind={kind}
        open={openNew}
        onClose={() => setOpenNew(false)}
        onCreated={() => {
          setOpenNew(false);
          load();
        }}
      />
      {openView && (
        <ViewOrderDialog kind={kind} id={openView} onClose={() => setOpenView(null)} onChanged={load} />
      )}
      {openEdit && (
        <EditOrderDialog kind={kind} id={openEdit} onClose={() => setOpenEdit(null)} onSaved={() => { setOpenEdit(null); load(); }} />
      )}
    </div>
  );
}

function CreateOrderDialog({ kind, open, onClose, onCreated }: any) {
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [partyId, setPartyId] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const partyEp = kind === "purchase" ? "/api/suppliers" : "/api/customers";
    fetch(`${partyEp}?pageSize=1000`).then((r) => r.json()).then((d) => setParties(d.items ?? []));
    fetch(`/api/products?pageSize=1000`).then((r) => r.json()).then((d) => setProducts(d.items ?? []));
    setPartyId("");
    setItems([]);
    setRemark("");
  }, [open, kind]);

  function addItem() {
    setItems([...items, { productId: "", quantity: 1, unitPrice: 0, discount: 0, taxRate: 0.05 }]);
  }
  function updateItem(idx: number, patch: any) {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    // 自動帶入單價
    if (patch.productId) {
      const p = products.find((x) => x.id === patch.productId);
      if (p) next[idx].unitPrice = Number(kind === "purchase" ? p.costPrice : p.salePrice);
    }
    setItems(next);
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  const discount = items.reduce((s, i) => s + Number(i.discount ?? 0), 0);
  const taxableTotal = subtotal - discount;
  const taxAmount = Math.round(taxableTotal * 0.05);
  const total = subtotal - discount + taxAmount;

  async function save() {
    if (!partyId) return toast.error(`請選擇${kind === "purchase" ? "供應商" : "客戶"}`);
    if (items.length === 0) return toast.error("請至少新增一項商品");
    if (items.some((i) => !i.productId)) return toast.error("請選擇商品");
    setSaving(true);
    try {
      const endpoint = kind === "purchase" ? "/api/purchases" : "/api/sales";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "purchase"
            ? { supplierId: partyId, items, remark, status: "SUBMITTED" }
            : { customerId: partyId, items, remark, status: "CONFIRMED" }
        ),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已建立");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>新增{kind === "purchase" ? "採購單" : "銷售單"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label>{kind === "purchase" ? "供應商" : "客戶"} *</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">請選擇</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.companyName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">商品</th>
                <th className="p-2 w-20">數量</th>
                <th className="p-2 w-28">單價</th>
                <th className="p-2 w-24">折扣</th>
                <th className="p-2 w-20">稅率</th>
                <th className="p-2 w-28 text-right">小計</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const line = Number(it.quantity) * Number(it.unitPrice) - Number(it.discount ?? 0);
                return (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })}>
                        <option value="">選擇商品</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} - {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" step="0.01" value={it.discount ?? 0} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" step="0.01" value={it.taxRate ?? 0} onChange={(e) => updateItem(idx, { taxRate: Number(e.target.value) })} />
                    </td>
                    <td className="p-2 text-right">{formatMoney(line)}</td>
                    <td className="p-2">
                      <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">
                    尚未新增商品
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="p-2">
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" />
              新增明細
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">小計</div>
            <div className="font-medium">{formatMoney(subtotal)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">折扣</div>
            <div className="font-medium">{formatMoney(discount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">稅額</div>
            <div className="font-medium">{formatMoney(taxAmount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">總計</div>
            <div className="font-bold text-lg">{formatMoney(total)}</div>
          </div>
        </div>

        <Textarea placeholder="備註" value={remark} onChange={(e) => setRemark(e.target.value)} />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewOrderDialog({ kind, id, onClose, onChanged }: any) {
  const [data, setData] = useState<any>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const endpoint = kind === "purchase" ? "/api/purchases" : "/api/sales";

  useEffect(() => {
    fetch(`${endpoint}/${id}`).then((r) => r.json()).then(setData);
    fetch(`/api/warehouses`).then((r) => r.json()).then((d) => {
      setWarehouses(d.items ?? []);
      if (d.items?.[0]) setWarehouseId(d.items[0].id);
    });
  }, [id, endpoint]);

  async function act(action: string) {
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, warehouseId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      toast.success("已處理");
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (!data) return null;
  const party = kind === "purchase" ? data.supplier : data.customer;
  const canReceiveShip = kind === "purchase" ? data.status === "APPROVED" || data.status === "SUBMITTED" : data.status === "CONFIRMED";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {kind === "purchase" ? "採購單" : "銷售單"} {data.number} <StatusBadge status={data.status} />
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">{kind === "purchase" ? "供應商" : "客戶"}</div>
            <div>{party?.companyName}</div>
          </div>
          <div>
            <div className="text-muted-foreground">日期</div>
            <div>{formatDate(data.orderDate)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">總計</div>
            <div className="font-bold">{formatMoney(data.total)}</div>
          </div>
        </div>
        <table className="w-full text-sm border rounded-md">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-2 text-left">SKU</th>
              <th className="p-2 text-left">商品</th>
              <th className="p-2 text-right">數量</th>
              <th className="p-2 text-right">單價</th>
              <th className="p-2 text-right">小計</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i: any) => (
              <tr key={i.id} className="border-t">
                <td className="p-2 font-mono text-xs">{i.product?.sku}</td>
                <td className="p-2">{i.product?.name}</td>
                <td className="p-2 text-right">{i.quantity}</td>
                <td className="p-2 text-right">{formatMoney(i.unitPrice)}</td>
                <td className="p-2 text-right">{formatMoney(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.remark && <div className="text-sm"><span className="text-muted-foreground">備註：</span>{data.remark}</div>}

        <div className="border-t pt-3 space-y-2">
          <Label>處理倉庫</Label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
            ))}
          </select>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => window.open(`/print/${kind === "purchase" ? "purchase" : "sales"}/${data.id}`, "_blank")}
          >
            <Printer className="h-4 w-4" />列印
          </Button>
          {(data.status === "RECEIVED" || data.status === "SHIPPED" || data.status === "INVOICED" || data.status === "PAID") && (
            <ConvertToJournalButton sourceType={kind === "purchase" ? "PURCHASE" : "SALES"} sourceId={data.id} />
          )}
          {data.status === "DRAFT" && <Button variant="outline" onClick={() => act("submit")}>送出</Button>}
          {data.status === "SUBMITTED" && kind === "purchase" && <Button variant="outline" onClick={() => act("approve")}>核准</Button>}
          {canReceiveShip && (
            <Button onClick={() => act(kind === "purchase" ? "receive" : "ship")}>
              {kind === "purchase" ? "進貨入庫" : "出貨扣庫"}
            </Button>
          )}
          {data.status !== "CANCELLED" && data.status !== "RECEIVED" && data.status !== "SHIPPED" && data.status !== "PAID" && (
            <Button variant="destructive" onClick={() => act("cancel")}>取消</Button>
          )}
          {(data.status === "DRAFT" || data.status === "CONFIRMED" || data.status === "SUBMITTED" || data.status === "CANCELLED") && (
            <Button variant="ghost" className="text-red-500 hover:text-red-700" onClick={async () => {
              if (!confirm(`確定刪除 ${data.number}？`)) return;
              const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
              if (!res.ok) { const e = await res.json(); toast.error(e.error || "刪除失敗"); return; }
              toast.success("已刪除");
              onChanged();
              onClose();
            }}>
              <Trash2 className="h-4 w-4" /> 刪除
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditOrderDialog({ kind, id, onClose, onSaved }: { kind: Kind; id: string; onClose: () => void; onSaved: () => void }) {
  const endpoint = kind === "purchase" ? "/api/purchases" : "/api/sales";
  const partyLabel = kind === "purchase" ? "供應商" : "客戶";
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [partyId, setPartyId] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const partyEp = kind === "purchase" ? "/api/suppliers" : "/api/customers";
    Promise.all([
      fetch(`${partyEp}?pageSize=1000`).then(r => r.json()),
      fetch("/api/products?pageSize=1000").then(r => r.json()),
      fetch(`${endpoint}/${id}`).then(r => r.json()),
    ]).then(([pData, prData, order]) => {
      setParties(pData.items ?? []);
      setProducts(prData.items ?? []);
      if (order) {
        setPartyId(kind === "purchase" ? order.supplierId : order.customerId);
        setRemark(order.remark || "");
        setItems((order.items || []).map((i: any) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount ?? 0),
          taxRate: Number(i.taxRate ?? 0),
        })));
      }
      setLoaded(true);
    });
  }, [id, kind, endpoint]);

  function addItem() {
    setItems([...items, { productId: "", quantity: 1, unitPrice: 0, discount: 0, taxRate: 0.05 }]);
  }
  function updateItem(idx: number, patch: any) {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    if (patch.productId) {
      const p = products.find((x) => x.id === patch.productId);
      if (p) next[idx].unitPrice = Number(kind === "purchase" ? p.costPrice : p.salePrice);
    }
    setItems(next);
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  const discount = items.reduce((s, i) => s + Number(i.discount ?? 0), 0);
  const taxableTotal = subtotal - discount;
  const taxAmount = Math.round(taxableTotal * 0.05);
  const total = subtotal - discount + taxAmount;

  async function save() {
    if (!partyId) return toast.error(`請選擇${partyLabel}`);
    if (items.length === 0) return toast.error("請至少新增一項商品");
    if (items.some((i) => !i.productId)) return toast.error("請選擇商品");
    setSaving(true);
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "purchase"
            ? { supplierId: partyId, items, remark }
            : { customerId: partyId, items, remark }
        ),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已更新");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>修改{kind === "purchase" ? "採購單" : "銷售單"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label>{partyLabel} *</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">請選擇</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.code} - {p.companyName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">商品</th>
                <th className="p-2 w-20">數量</th>
                <th className="p-2 w-28">單價</th>
                <th className="p-2 w-24">折扣</th>
                <th className="p-2 w-20">稅率</th>
                <th className="p-2 w-28 text-right">小計</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const line = Number(it.quantity) * Number(it.unitPrice) - Number(it.discount ?? 0);
                return (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })}>
                        <option value="">選擇商品</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2"><Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} /></td>
                    <td className="p-2"><Input type="number" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} /></td>
                    <td className="p-2"><Input type="number" step="0.01" value={it.discount ?? 0} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} /></td>
                    <td className="p-2"><Input type="number" step="0.01" value={it.taxRate ?? 0} onChange={(e) => updateItem(idx, { taxRate: Number(e.target.value) })} /></td>
                    <td className="p-2 text-right">{formatMoney(line)}</td>
                    <td className="p-2">
                      <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">尚未新增商品</td></tr>
              )}
            </tbody>
          </table>
          <div className="p-2">
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" /> 新增明細
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 text-sm">
          <div><div className="text-muted-foreground">小計</div><div className="font-medium">{formatMoney(subtotal)}</div></div>
          <div><div className="text-muted-foreground">折扣</div><div className="font-medium">{formatMoney(discount)}</div></div>
          <div><div className="text-muted-foreground">稅額</div><div className="font-medium">{formatMoney(taxAmount)}</div></div>
          <div><div className="text-muted-foreground">總計</div><div className="font-bold text-lg">{formatMoney(total)}</div></div>
        </div>

        <Textarea placeholder="備註" value={remark} onChange={(e) => setRemark(e.target.value)} />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存修改"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
