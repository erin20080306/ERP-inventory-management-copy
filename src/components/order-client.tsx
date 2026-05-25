"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Eye, Search, Download, Printer, FileDown, Pencil, Settings2 } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { ConvertToJournalButton } from "@/components/convert-to-journal-button";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { TableHint, useColumnDrag, useDebouncedValue } from "@/components/table-helpers";

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
  updatedBy?: string | null;
  items?: Array<{
    product?: { name: string };
    quantity: number;
  }>;
};

export function OrderClient({ kind }: { kind: Kind }) {
  const endpoint = kind === "purchase" ? "/api/purchases" : "/api/sales";
  const partyLabel = kind === "purchase" ? "供應商" : "客戶";
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [openView, setOpenView] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState<string | null>(null);
  const pageSize = 20;
  const customCols = useCustomColumns(kind === "purchase" ? "purchases" : "sales");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const colDrag = useColumnDrag(kind === "purchase" ? "purchases" : "sales", ["number", "party", "date", "products", "quantity", "amount", "status", "updatedBy"]);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: debouncedQ, page: String(page), pageSize: String(pageSize) });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`${endpoint}?${params}`);
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
  }, [page, debouncedQ, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function onAct(id: string, action: string) {
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      const data = await res.json();
      toast.success(data.message || "已處理");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Inline editing functions
  const editableFields = ["orderDate"];
  
  function startCellEdit(row: OrderRow, colKey: string) {
    if (!inlineEditing[row.id]) {
      const draft: Record<string, any> = {};
      editableFields.forEach((f) => { draft[f] = (row as any)[f] ?? ""; });
      setInlineEditing((prev) => ({ ...prev, [row.id]: draft }));
    }
    setActiveCell({ rowId: row.id, colKey });
  }

  function handleCellKeyDown(e: React.KeyboardEvent, row: OrderRow, colKey: string) {
    const rowIdx = rows.findIndex((r) => r.id === row.id);
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
      } else if (rowIdx < rows.length - 1) {
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
        } else if (rowIdx < rows.length - 1) {
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

  async function saveCellAndMove(currentRow: OrderRow, targetRowIdx: number, targetColKey: string) {
    await saveInlineEdit(currentRow);
    if (targetRowIdx >= 0 && targetRowIdx < rows.length) {
      const targetRow = rows[targetRowIdx];
      startCellEdit(targetRow, targetColKey);
    } else {
      setActiveCell(null);
    }
  }

  async function saveInlineEdit(row: OrderRow) {
    const draft = inlineEditing[row.id];
    if (!draft) return;
    setInlineSaving(row.id);
    try {
      const payload = { ...(row as any), ...draft };
      const res = await fetch(`${endpoint}/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const saved = await res.json().catch(() => null);
      toast.success("已儲存");
      setInlineEditing((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      setRows((prev) => prev.map((r) => r.id === row.id ? (saved && saved.id ? saved : { ...r, ...draft } as OrderRow) : r));
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
      {/* 手機版：新增按鈕置頂 */}
      <div className="md:hidden">
        <Button className="w-full h-12 text-base font-semibold" onClick={() => setOpenNew(true)}>
          <Plus className="h-5 w-5 mr-1" />
          新增{kind === "purchase" ? "採購單" : "銷售單"}
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder={`搜尋單號 / ${partyLabel}`} className="pl-9 w-full" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        <div className="hidden md:flex items-center gap-2">
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
            try {
              const params = new URLSearchParams({ q, pageSize: "10000" });
              const res = await fetch(`${endpoint}?${params}`);
              const d = await res.json();
              const { downloadExcel } = await import("@/lib/excel");
              // 展開商品明細
              const flatData: any[] = [];
              d.items.forEach((order: any) => {
                const party = kind === "purchase" ? order.supplier : order.customer;
                order.items.forEach((item: any) => {
                  flatData.push({
                    單號: order.number,
                    [kind === "purchase" ? "供應商" : "客戶"]: party?.companyName ?? "",
                    日期: formatDate(order.orderDate),
                    狀態: order.status,
                    商品SKU: item.product?.sku ?? "",
                    商品名稱: item.product?.name ?? "",
                    規格: item.product?.spec ?? "",
                    數量: item.quantity,
                    單價: Number(item.unitPrice),
                    小計: Number(item.subtotal),
                    折扣: Number(item.discount || 0),
                    稅率: Number(item.taxRate || 0),
                    圖片URL: (item.product?.imageUrl ?? "").slice(0, 1000),
                  });
                });
              });
              downloadExcel(kind === "purchase" ? "採購單" : "銷售單", kind === "purchase" ? "採購單" : "銷售單", flatData, [
                { key: "單號", title: "單號" },
                { key: kind === "purchase" ? "供應商" : "客戶", title: kind === "purchase" ? "供應商" : "客戶" },
                { key: "日期", title: "日期" },
                { key: "狀態", title: "狀態" },
                { key: "商品SKU", title: "商品SKU" },
                { key: "商品名稱", title: "商品名稱" },
                { key: "規格", title: "規格" },
                { key: "數量", title: "數量" },
                { key: "單價", title: "單價" },
                { key: "小計", title: "小計" },
                { key: "折扣", title: "折扣" },
                { key: "稅率", title: "稅率" },
                { key: "圖片URL", title: "圖片URL" },
              ]);
              toast.success("已匯出 Excel");
            } catch (e: any) {
              toast.error(e.message || "匯出失敗");
            }
          }}>
            <FileDown className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            列印
          </Button>
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4" />
            新增{kind === "purchase" ? "採購單" : "銷售單"}
          </Button>
        </div>
        {/* 手機版匯出按鈕 */}
        <div className="md:hidden flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={async () => {
            const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&pageSize=10000`);
            const d = await res.json();
            const csv = toCSV(d.items, [
              { key: "number", title: "單號" },
              { key: "party", title: partyLabel, get: (r: any) => (kind === "purchase" ? r.supplier : r.customer)?.companyName ?? "" },
              { key: "orderDate", title: "日期", get: (r: any) => formatDate(r.orderDate) },
              { key: "total", title: "總計" },
              { key: "status", title: "狀態" },
            ]);
            downloadCSV(`${kind}-orders-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            toast.success("已匯出 CSV");
          }}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&pageSize=10000`);
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
            <FileDown className="h-4 w-4 mr-1" /> Excel
          </Button>
          <PDFOrderBtn kind={kind} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> 列印
          </Button>
        </div>
      </div>

      <TableHint />
      <Table>
        <THead>
          <TR>
            <TH>圖片</TH>
            <TH {...colDrag.thProps("number")}>單號</TH>
            <TH {...colDrag.thProps("party")}>{partyLabel}</TH>
            <TH {...colDrag.thProps("date")}>日期</TH>
            <TH {...colDrag.thProps("products")}>商品</TH>
            <TH {...colDrag.thProps("quantity")}>數量</TH>
            <TH {...colDrag.thProps("amount")}>金額</TH>
            <TH {...colDrag.thProps("status")}>狀態</TH>
            <TH {...colDrag.thProps("updatedBy")}>操作人員</TH>
            {customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}
            <TH className="w-20 text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && (
            <TR>
              <TD colSpan={10} className="text-center py-10">
                <Loader2 className="h-5 w-5 animate-spin inline-block" />
              </TD>
            </TR>
          )}
          {!loading && rows.length === 0 && (
            <TR>
              <TD colSpan={10}>
                <EmptyState />
              </TD>
            </TR>
          )}
          {!loading &&
            rows.map((r) => {
              const draft = inlineEditing[r.id];
              const isRowEditing = !!draft;
              return (
              <TR key={r.id} className={isRowEditing ? "bg-accent/5" : ""}>
                <TD>
                  {(r.items?.[0]?.product as any)?.imageUrl ? (
                    <img src={(r.items?.[0]?.product as any)?.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">-</div>
                  )}
                </TD>
                <TD className="font-mono text-xs">{r.number}</TD>
                <TD>{(kind === "purchase" ? r.supplier : r.customer)?.companyName ?? "—"}</TD>
                <TD
                  className={editableFields.includes("orderDate") ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                  onClick={() => { if (editableFields.includes("orderDate")) startCellEdit(r, "orderDate"); }}
                >
                  {activeCell?.rowId === r.id && activeCell?.colKey === "orderDate" ? (
                    <Input
                      type="date"
                      value={draft?.orderDate ?? r.orderDate?.slice(0, 10) ?? ""}
                      autoFocus
                      onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], orderDate: e.target.value } }))}
                      className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                      onKeyDown={(e) => handleCellKeyDown(e, r, "orderDate")}
                      ref={(el) => { if (el) el.focus(); }}
                    />
                  ) : (
                    formatDate(r.orderDate)
                  )}
                </TD>
                <TD className="text-xs max-w-[200px] truncate" title={r.items?.map((i: any) => i.product?.name).join(", ")}>
                  {r.items?.map((i: any) => i.product?.name).join(", ") || "—"}
                </TD>
                <TD className="text-xs">
                  {r.items?.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0) || 0}
                </TD>
                <TD>{formatMoney(r.total)}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
                {customCols.columns.map((cc) => {
                  const cellKey = `${r.id}_${cc.id}`;
                  const vals = getCustomFieldValues(kind === "purchase" ? "purchases" : "sales", r.id);
                  const isEditing = editingCells[cellKey];
                  return (
                    <TD key={cc.id}>
                      {isEditing ? (
                        <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={vals[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue(kind === "purchase" ? "purchases" : "sales", r.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [cellKey]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                      ) : (
                        <span className="inline-block min-h-[24px] min-w-[40px] cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted" onClick={() => setEditingCells((p) => ({ ...p, [cellKey]: true }))}>{vals[cc.id] || "—"}</span>
                      )}
                    </TD>
                  );
                })}
                <TD className="text-right flex items-center justify-end gap-0">
                  {r.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => onAct(r.id, "submit")}>送出</Button>}
                  {r.status === "SUBMITTED" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onAct(r.id, "approve")}>審核</Button>
                      <Button size="sm" variant="destructive" onClick={() => onAct(r.id, "reject")}>駁回</Button>
                    </>
                  )}
                  {r.status === "APPROVED" && <Button size="sm" onClick={() => onAct(r.id, "post")}>過帳</Button>}
                  {r.status !== "VOIDED" && r.status !== "POSTED" && <Button size="sm" variant="destructive" onClick={() => onAct(r.id, "cancel")}>作廢</Button>}
                  <Button variant="ghost" size="icon" onClick={() => setOpenView(r.id)} title="查看">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setOpenEdit(r.id)} title="修改">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title="刪除" onClick={async () => {
                    if (!confirm(`確定刪除 ${r.number}？\n\n刪除將同時刪除關聯的應收應付記錄與傳票，此操作無法復原。`)) return;
                    const res = await fetch(`${endpoint}/${r.id}`, { method: "DELETE" });
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
        onCreated={(newOrder) => {
          setOpenNew(false);
          if (newOrder) {
            setRows((prev) => [newOrder, ...prev]);
            setTotal((prev) => prev + 1);
          } else {
            load();
          }
        }}
      />
      {openView && (
        <ViewOrderDialog kind={kind} id={openView} onClose={() => setOpenView(null)} onChanged={load} />
      )}
      {openEdit && (
        <EditOrderDialog kind={kind} id={openEdit} onClose={() => setOpenEdit(null)} onSaved={(updated) => { setOpenEdit(null); if (updated) { setRows((prev) => prev.map((r) => r.id === updated.id ? updated : r)); } else { load(); } }} />
      )}
      <CustomColumnDialog
        module={kind === "purchase" ? "purchases" : "sales"}
        columns={customCols.columns}
        open={customCols.open}
        onClose={() => customCols.setOpen(false)}
        onSave={customCols.save}
      />
    </div>
  );
}

function CreateOrderDialog({ kind, open, onClose, onCreated }: { kind: Kind; open: boolean; onClose: () => void; onCreated: (newOrder: OrderRow | null) => void }) {
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [partyId, setPartyId] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [remark, setRemark] = useState("");
  const [isTaxable, setIsTaxable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colKey: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const partyEp = kind === "purchase" ? "/api/suppliers" : "/api/customers";
    fetch(`${partyEp}?pageSize=1000`).then((r) => r.json()).then((d) => setParties(d.items ?? []));
    fetch(`/api/products?pageSize=1000`).then((r) => r.json()).then((d) => setProducts(d.items ?? []));
    setPartyId("");
    setItems([]);
    setRemark("");
    setIsTaxable(true);
    setActiveCell(null);
  }, [open, kind]);

  function addItem() {
    setItems([...items, { productId: "", quantity: "", unitPrice: "", discount: "", taxRate: 0.05 }]);
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

  function handleItemKeyDown(e: React.KeyboardEvent, rowIdx: number, colKey: string) {
    const fields = ["productId", "quantity", "unitPrice", "discount", "taxRate"];
    const colIdx = fields.indexOf(colKey);
    if (colIdx === -1) return;

    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (rowIdx < items.length - 1) {
        setActiveCell({ rowIdx: rowIdx + 1, colKey });
      } else {
        addItem();
        setActiveCell({ rowIdx: items.length, colKey });
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (rowIdx > 0) {
        setActiveCell({ rowIdx: rowIdx - 1, colKey });
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      if (colIdx < fields.length - 1) {
        setActiveCell({ rowIdx, colKey: fields[colIdx + 1] });
      } else if (rowIdx < items.length - 1) {
        setActiveCell({ rowIdx: rowIdx + 1, colKey: fields[0] });
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      if (colIdx > 0) {
        setActiveCell({ rowIdx, colKey: fields[colIdx - 1] });
      } else if (rowIdx > 0) {
        setActiveCell({ rowIdx: rowIdx - 1, colKey: fields[fields.length - 1] });
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        if (colIdx > 0) {
          setActiveCell({ rowIdx, colKey: fields[colIdx - 1] });
        } else if (rowIdx > 0) {
          setActiveCell({ rowIdx: rowIdx - 1, colKey: fields[fields.length - 1] });
        }
      } else {
        if (colIdx < fields.length - 1) {
          setActiveCell({ rowIdx, colKey: fields[colIdx + 1] });
        } else if (rowIdx < items.length - 1) {
          setActiveCell({ rowIdx: rowIdx + 1, colKey: fields[0] });
        }
      }
    }
  }

  const subtotal = items.reduce((s, i) => s + Math.round(Number(i.quantity)) * Math.round(Number(i.unitPrice)), 0);
  const discount = items.reduce((s, i) => s + Math.round(Number(i.discount ?? 0)), 0);
  const taxableTotal = subtotal - discount;
  const taxAmount = isTaxable ? Math.round(taxableTotal * 0.05) : 0;
  const total = subtotal - discount + taxAmount;

  async function save() {
    if (!partyId) return toast.error(`請選擇${kind === "purchase" ? "供應商" : "客戶"}`);
    if (items.length === 0) return toast.error("請至少新增一項商品");
    if (items.some((i) => !i.productId)) return toast.error("請選擇商品");
    setSaving(true);
    try {
      const endpoint = kind === "purchase" ? "/api/purchases" : "/api/sales";
      const loadingToastId = toast.loading("建立中...", { duration: 0 });
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "purchase"
            ? { supplierId: partyId, items, remark, status: "SUBMITTED", isTaxable }
            : { customerId: partyId, items, remark, status: "SUBMITTED", isTaxable }
        ),
      });
      toast.dismiss(loadingToastId);
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const data = await res.json();
      if (data.autoCreated) {
        toast.success(kind === "purchase" ? "已自動建立應付帳款與傳票" : "已自動建立應收帳款與傳票");
      } else {
        toast.success("已建立");
      }
      onCreated(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增{kind === "purchase" ? "採購單" : "銷售單"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1 col-span-1 md:col-span-2">
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
          <div className="space-y-1">
            <Label>備註</Label>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1 flex items-center gap-2">
            <input type="checkbox" id="isTaxable" checked={isTaxable} onChange={(e) => setIsTaxable(e.target.checked)} />
            <Label htmlFor="isTaxable" className="cursor-pointer">應稅收據</Label>
          </div>
        </div>

        {/* 手機版：卡片式明細 */}
        <div className="md:hidden space-y-3">
          {items.map((it, idx) => {
            const line = Number(it.quantity) * Number(it.unitPrice) - Number(it.discount ?? 0);
            const product = products.find((p) => p.id === it.productId);
            return (
              <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">明細 {idx + 1}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
                <div className="flex gap-3">
                  {product?.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="w-16 h-16 object-cover rounded" />
                  ) : (
                    <div className="w-16 h-16 rounded bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">無圖片</div>
                  )}
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">商品</Label>
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })} onKeyDown={(e) => handleItemKeyDown(e, idx, "productId")}>
                      <option value="">選擇商品</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">數量</Label>
                    <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} onKeyDown={(e) => handleItemKeyDown(e, idx, "quantity")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">單價</Label>
                    <Input type="number" step="1" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} onKeyDown={(e) => handleItemKeyDown(e, idx, "unitPrice")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">折扣</Label>
                    <Input type="number" step="1" value={it.discount ?? 0} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} onKeyDown={(e) => handleItemKeyDown(e, idx, "discount")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">稅率</Label>
                    <Input type="number" step="1" value={it.taxRate ?? 0} onChange={(e) => updateItem(idx, { taxRate: Number(e.target.value) })} onKeyDown={(e) => handleItemKeyDown(e, idx, "taxRate")} />
                  </div>
                </div>
                <div className="text-right text-sm font-medium">小計：{formatMoney(line)}</div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm border rounded-lg border-dashed">尚未新增商品</div>
          )}
          <Button variant="outline" className="w-full" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> 新增明細
          </Button>
        </div>

        {/* 桌面版：表格式明細 */}
        <div className="hidden md:block border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left whitespace-nowrap">圖片</th><th className="p-2 text-left whitespace-nowrap">商品</th>
                  <th className="p-2 w-20 whitespace-nowrap">數量</th>
                  <th className="p-2 w-28 whitespace-nowrap">單價</th>
                  <th className="p-2 w-24 whitespace-nowrap">折扣</th>
                  <th className="p-2 w-20 whitespace-nowrap">稅率</th>
                  <th className="p-2 w-28 text-right whitespace-nowrap">小計</th>
                  <th className="p-2 w-10 whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const line = Number(it.quantity) * Number(it.unitPrice) - Number(it.discount ?? 0);
                  const product = products.find((p) => p.id === it.productId);
                  return (
                    <tr key={idx} className="border-t">
                      <td className="p-2">
                        {product?.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">-</div>
                        )}
                      </td>
                      <td className="p-2">
                        <select className={`h-9 w-full rounded-md border border-input bg-background px-2 text-sm ${activeCell?.rowIdx === idx && activeCell?.colKey === "productId" ? "ring-2 ring-ring ring-inset" : ""}`} value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })} onKeyDown={(e) => handleItemKeyDown(e, idx, "productId")} ref={(el) => { if (el && activeCell?.rowIdx === idx && activeCell?.colKey === "productId") el.focus(); }}>
                          <option value="">選擇商品</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2"><Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} onKeyDown={(e) => handleItemKeyDown(e, idx, "quantity")} className={activeCell?.rowIdx === idx && activeCell?.colKey === "quantity" ? "ring-2 ring-ring ring-inset" : ""} ref={(el) => { if (el && activeCell?.rowIdx === idx && activeCell?.colKey === "quantity") el.focus(); }} /></td>
                      <td className="p-2"><Input type="number" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} onKeyDown={(e) => handleItemKeyDown(e, idx, "unitPrice")} className={activeCell?.rowIdx === idx && activeCell?.colKey === "unitPrice" ? "ring-2 ring-ring ring-inset" : ""} ref={(el) => { if (el && activeCell?.rowIdx === idx && activeCell?.colKey === "unitPrice") el.focus(); }} /></td>
                      <td className="p-2"><Input type="number" step="0.01" value={it.discount ?? 0} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} onKeyDown={(e) => handleItemKeyDown(e, idx, "discount")} className={activeCell?.rowIdx === idx && activeCell?.colKey === "discount" ? "ring-2 ring-ring ring-inset" : ""} ref={(el) => { if (el && activeCell?.rowIdx === idx && activeCell?.colKey === "discount") el.focus(); }} /></td>
                      <td className="p-2"><Input type="number" step="0.01" value={it.taxRate ?? 0} onChange={(e) => updateItem(idx, { taxRate: Number(e.target.value) })} onKeyDown={(e) => handleItemKeyDown(e, idx, "taxRate")} className={activeCell?.rowIdx === idx && activeCell?.colKey === "taxRate" ? "ring-2 ring-ring ring-inset" : ""} ref={(el) => { if (el && activeCell?.rowIdx === idx && activeCell?.colKey === "taxRate") el.focus(); }} /></td>
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
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">尚未新增商品</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-2">
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" /> 新增明細
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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

        <DialogFooter className="flex-col-reverse md:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full md:w-auto">取消</Button>
          <Button onClick={save} disabled={saving} className="w-full md:w-auto">
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
      const data = await res.json();
      if (data.message) {
        toast.success(data.message);
      } else {
        toast.success("已處理");
      }
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (!data) return null;
  const party = kind === "purchase" ? data.supplier : data.customer;
  const canReceiveShip = kind === "purchase" ? data.status === "APPROVED" || data.status === "SUBMITTED" : data.status === "APPROVED";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {kind === "purchase" ? "採購單" : "銷售單"} {data.number} <StatusBadge status={data.status} />
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm border rounded-md min-w-[400px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left whitespace-nowrap">SKU</th>
                <th className="p-2 text-left whitespace-nowrap">商品</th>
                <th className="p-2 text-right whitespace-nowrap">數量</th>
                <th className="p-2 text-right whitespace-nowrap">單價</th>
                <th className="p-2 text-right whitespace-nowrap">小計</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i: any) => (
                <tr key={i.id} className="border-t">
                  <td className="p-2 font-mono text-xs whitespace-nowrap">{i.product?.sku}</td>
                  <td className="p-2 whitespace-nowrap">{i.product?.name}</td>
                  <td className="p-2 text-right whitespace-nowrap">{i.quantity}</td>
                  <td className="p-2 text-right whitespace-nowrap">{formatMoney(i.unitPrice)}</td>
                  <td className="p-2 text-right whitespace-nowrap">{formatMoney(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.remark && <div className="text-sm"><span className="text-muted-foreground">備註：</span>{data.remark}</div>}

        <div className="border-t pt-3 space-y-2">
          <Label>處理倉庫</Label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
            ))}
          </select>
        </div>

        <DialogFooter className="gap-2 flex-wrap flex-col-reverse md:flex-row">
          <Button
            variant="outline"
            onClick={() => window.open(`/print/${kind === "purchase" ? "purchase" : "sales"}/${data.id}`, "_blank")}
          >
            <Printer className="h-4 w-4" />列印
          </Button>
          {data.status === "POSTED" && (
            <ConvertToJournalButton sourceType={kind === "purchase" ? "PURCHASE" : "SALES"} sourceId={data.id} />
          )}
          {data.status === "DRAFT" && <Button variant="outline" onClick={() => act("submit")}>送出</Button>}
          {data.status === "SUBMITTED" && (
            <>
              <Button variant="outline" onClick={() => act("approve")}>審核</Button>
              <Button variant="destructive" onClick={() => act("reject")}>駁回</Button>
            </>
          )}
          {data.status === "APPROVED" && <Button variant="outline" onClick={() => act("post")}>過帳</Button>}
          {canReceiveShip && (
            <Button onClick={() => act(kind === "purchase" ? "receive" : "ship")}>
              {kind === "purchase" ? "進貨入庫" : "出貨扣庫"}
            </Button>
          )}
          {data.status !== "VOIDED" && data.status !== "POSTED" && (
            <Button variant="destructive" onClick={() => act("cancel")}>作廢</Button>
          )}
          {(data.status === "DRAFT" || data.status === "APPROVED" || data.status === "SUBMITTED" || data.status === "VOIDED") && (
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

function EditOrderDialog({ kind, id, onClose, onSaved }: { kind: Kind; id: string; onClose: () => void; onSaved: (updated?: any) => void }) {
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
    setItems([...items, { productId: "", quantity: "", unitPrice: "", discount: "", taxRate: 0.05 }]);
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
      const saved = await res.json();
      toast.success("已更新");
      onSaved(saved);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>修改{kind === "purchase" ? "採購單" : "銷售單"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1 col-span-1 md:col-span-2">
            <Label>{partyLabel} *</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">請選擇</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.code} - {p.companyName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 手機版：卡片式明細 */}
        <div className="md:hidden space-y-3">
          {items.map((it, idx) => {
            const line = Number(it.quantity) * Number(it.unitPrice) - Number(it.discount ?? 0);
            return (
              <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">明細 {idx + 1}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">商品</Label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })}>
                    <option value="">選擇商品</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">數量</Label>
                    <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">單價</Label>
                    <Input type="number" step="1" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">折扣</Label>
                    <Input type="number" step="1" value={it.discount ?? 0} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">稅率</Label>
                    <Input type="number" step="1" value={it.taxRate ?? 0} onChange={(e) => updateItem(idx, { taxRate: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="text-right text-sm font-medium">小計：{formatMoney(line)}</div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm border rounded-lg border-dashed">尚未新增商品</div>
          )}
          <Button variant="outline" className="w-full" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> 新增明細
          </Button>
        </div>

        {/* 桌面版：表格式明細 */}
        <div className="hidden md:block border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left whitespace-nowrap">商品</th>
                  <th className="p-2 w-20 whitespace-nowrap">數量</th>
                  <th className="p-2 w-28 whitespace-nowrap">單價</th>
                  <th className="p-2 w-24 whitespace-nowrap">折扣</th>
                  <th className="p-2 w-20 whitespace-nowrap">稅率</th>
                  <th className="p-2 w-28 text-right whitespace-nowrap">小計</th>
                  <th className="p-2 w-10 whitespace-nowrap"></th>
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
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">尚未新增商品</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-2">
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" /> 新增明細
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-muted-foreground">小計</div><div className="font-medium">{formatMoney(subtotal)}</div></div>
          <div><div className="text-muted-foreground">折扣</div><div className="font-medium">{formatMoney(discount)}</div></div>
          <div><div className="text-muted-foreground">稅額</div><div className="font-medium">{formatMoney(taxAmount)}</div></div>
          <div><div className="text-muted-foreground">總計</div><div className="font-bold text-lg">{formatMoney(total)}</div></div>
        </div>

        <Textarea placeholder="備註" value={remark} onChange={(e) => setRemark(e.target.value)} />

        <DialogFooter className="flex-col-reverse md:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full md:w-auto">取消</Button>
          <Button onClick={save} disabled={saving} className="w-full md:w-auto">{saving ? "儲存中..." : "儲存修改"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
