"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Eye, Search, Download, Printer, FileDown, Pencil, RotateCcw, CreditCard } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { useCustomColumns, useCustomFieldValues, CustomColumnDialog, CustomColumnButton, CustomFieldGridCell } from "@/components/custom-columns";
import { readSessionCache, TableHint, useColumnDrag, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";

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
    receivedQty?: number;
    shippedQty?: number;
  }>;
};

function TableSkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
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

export function OrderClient({ kind, serverExcelExport }: { kind: Kind; serverExcelExport?: string }) {
  const endpoint = kind === "purchase" ? "/api/purchases" : "/api/sales";
  const partyLabel = kind === "purchase" ? "供應商" : "客戶";
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
  const colDrag = useColumnDrag(kind === "purchase" ? "purchases" : "sales", ["number", "party", "date", "products", "quantity", "amount", "taxAmount", "status", "updatedBy"]);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [, setInlineSaving] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);

  // SWR fetcher
  const fetcher = useCallback(async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json()).error || "載入失敗");
    return res.json();
  }, []);

  // 構建 SWR key
  const swrKey = useCallback(() => {
    const params = new URLSearchParams({ q: debouncedQ, page: String(page), pageSize: String(pageSize) });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return `${endpoint}?${params.toString()}`;
  }, [endpoint, debouncedQ, page, fromDate, toDate]);

  const tableKey = swrKey();
  const cachedData = useMemo(() => readSessionCache<any>(tableKey), [tableKey]);
  const { data, error, isLoading, isValidating } = useSWR(tableKey, fetcher, {
    fallbackData: cachedData,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true,
    dedupingInterval: 15000,
    focusThrottleInterval: 30000,
    onSuccess: (nextData) => writeSessionCache(tableKey, nextData),
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const customFieldModule = kind === "purchase" ? "purchases" : "sales";
  const customFieldValues = useCustomFieldValues(customFieldModule, rows.map((row: OrderRow) => row.id));
  const tableColumnCount = 11 + customCols.columns.length;
  const showInitialLoading = isLoading && !data;
  const showRefreshing = isValidating && !!data && !isLoading;

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
      mutate(swrKey());
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
    const rowIdx = rows.findIndex((r: OrderRow) => r.id === row.id);
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
      await res.json().catch(() => null);
      toast.success("已儲存");
      setInlineEditing((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      mutate(swrKey());
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
              if (serverExcelExport) {
                const params = new URLSearchParams({ q });
                if (fromDate) params.set("from", fromDate);
                if (toDate) params.set("to", toDate);
                const res = await fetch(`${serverExcelExport}?${params.toString()}`);
                if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "匯出失敗");
                const blob = await res.blob();
                const cd = res.headers.get("Content-Disposition") || "";
                const m = cd.match(/filename\*=UTF-8''([^;]+)/);
                const filename = m ? decodeURIComponent(m[1]) : `${kind === "purchase" ? "採購單" : "銷售單"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast.success("已匯出 Excel");
                return;
              }
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
                    稅金: Math.round(Number(item.subtotal || 0) * Number(item.taxRate || 0)),
                    圖片URL: (item.product?.imageUrl && !item.product.imageUrl.startsWith("data:")) ? item.product.imageUrl : "",
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
                { key: "稅金", title: "稅金" },
                { key: "圖片URL", title: "圖片URL", isUrl: true, get: (r: any) => r.圖片URL ? "查看圖片" : "", urlGet: (r: any) => r.圖片URL || "" },
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
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
        </div>
      </div>

      <TableHint />
      <Table>
        <THead onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title="表頭按右鍵可新增／刪減自訂欄位">
          <TR>
            <TH>圖片</TH>
            <TH {...colDrag.thProps("number")}>單號</TH>
            <TH {...colDrag.thProps("party")}>{partyLabel}</TH>
            <TH {...colDrag.thProps("date")}>日期</TH>
            <TH {...colDrag.thProps("products")}>商品</TH>
            <TH {...colDrag.thProps("quantity")}>數量</TH>
            <TH {...colDrag.thProps("amount")}>金額</TH>
            <TH {...colDrag.thProps("taxAmount")}>稅金</TH>
            <TH {...colDrag.thProps("status")}>狀態</TH>
            <TH {...colDrag.thProps("updatedBy")}>操作人員</TH>
            {customCols.columns.map((cc) => <TH key={cc.id} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title="按右鍵管理自訂欄位">{cc.label}</TH>)}
            <TH className="w-20 text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {showInitialLoading && <TableSkeletonRows columns={tableColumnCount} />}
          {error && !showInitialLoading && rows.length === 0 && (
            <TR>
              <TD colSpan={tableColumnCount} className="py-8 text-center text-sm text-destructive">
                {error.message || "資料載入失敗"}
              </TD>
            </TR>
          )}
          {!showInitialLoading && !error && rows.length === 0 && (
            <TR>
              <TD colSpan={tableColumnCount}>
                <EmptyState />
              </TD>
            </TR>
          )}
          {!showInitialLoading &&
            rows.map((r: OrderRow, rowIndex: number) => {
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
                  {(() => {
                    const ordered = r.items?.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0) || 0;
                    const processed = r.items?.reduce(
                      (sum: number, i: any) => sum + Number(kind === "purchase" ? i.receivedQty || 0 : i.shippedQty || 0),
                      0,
                    ) || 0;
                    return processed > 0 ? `${processed} / ${ordered}` : ordered;
                  })()}
                </TD>
                <TD>{formatMoney(r.total)}</TD>
                <TD className="text-xs">
                  {formatMoney(
                    Math.round(
                      (r as any).items?.reduce((sum: number, i: any) => {
                        const subtotal = Number(i.subtotal || 0);
                        const taxRate = Number(i.taxRate || 0);
                        return sum + (subtotal * taxRate);
                      }, 0) || 0
                    )
                  )}
                </TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
                {customCols.columns.map((cc, columnIndex) => { const vals = customFieldValues.getValues(r.id); return <TD key={cc.id}><CustomFieldGridCell gridId={`orders-${kind}`} rowId={r.id} rowIndex={rowIndex} column={cc} columnIndex={columnIndex} rowIds={rows.map((row: OrderRow) => row.id)} columns={customCols.columns} value={vals[cc.id] ?? ""} saveValues={customFieldValues.saveValues} onManageColumns={() => customCols.setOpen(true)} /></TD>; })}
                <TD className="text-right flex items-center justify-end gap-0">
                  {(r.status === "DRAFT" || r.status === "REJECTED") && <Button size="sm" variant="outline" onClick={() => onAct(r.id, "submit")}>送出</Button>}
                  {r.status === "SUBMITTED" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onAct(r.id, "approve")}>審核</Button>
                      <Button size="sm" variant="destructive" onClick={() => onAct(r.id, "reject")}>駁回</Button>
                    </>
                  )}
                  {(
                    r.status === "APPROVED" ||
                    (kind === "purchase" && r.status === "PARTIALLY_RECEIVED") ||
                    (kind === "sales" && r.status === "PARTIALLY_SHIPPED")
                  ) && <Button size="sm" onClick={() => setOpenView(r.id)}>{kind === "purchase" ? "進貨" : "出貨"}</Button>}
                  {!['VOIDED', 'POSTED', 'PARTIALLY_RECEIVED', 'PARTIALLY_SHIPPED'].includes(r.status) && <Button size="sm" variant="destructive" onClick={() => onAct(r.id, "cancel")}>作廢</Button>}
                  <Button variant="ghost" size="icon" onClick={() => setOpenView(r.id)} title="查看">
                    <Eye className="h-4 w-4" />
                  </Button>
                  {(r.status === "DRAFT" || r.status === "REJECTED") && <Button variant="ghost" size="icon" onClick={() => setOpenEdit(r.id)} title="修改">
                    <Pencil className="h-4 w-4" />
                  </Button>}
                  {(r.status === "DRAFT" || r.status === "REJECTED") && <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title="刪除" onClick={async () => {
                    if (!confirm(`確定刪除 ${r.number}？\n\n刪除將同時刪除關聯的應收應付記錄與傳票，此操作無法復原。`)) return;
                    const res = await fetch(`${endpoint}/${r.id}`, { method: "DELETE" });
                    if (!res.ok) { const e = await res.json(); toast.error(e.error || "刪除失敗"); return; }
                    toast.success("已刪除");
                    mutate(swrKey());
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>}
                </TD>
              </TR>
            );
            })}
        </TBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          共 {total} 筆
          {showRefreshing && <span className="ml-2 text-xs text-muted-foreground">更新中...</span>}
        </div>
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
        onCreated={(_newOrder) => {
          setOpenNew(false);
          mutate(swrKey());
        }}
      />
      {openView && (
        <ViewOrderDialog kind={kind} id={openView} onClose={() => setOpenView(null)} onChanged={() => mutate(swrKey())} />
      )}
      {openEdit && (
        <EditOrderDialog kind={kind} id={openEdit} onClose={() => setOpenEdit(null)} onSaved={(_updated) => { setOpenEdit(null); mutate(swrKey()); }} />
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
  const [fulfillQty, setFulfillQty] = useState<Record<string, number | string>>({});
  const [fulfillmentRemark, setFulfillmentRemark] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundQty, setRefundQty] = useState<Record<string, number | string>>({});
  const [refundDisposition, setRefundDisposition] = useState<Record<string, "SELLABLE" | "DAMAGED" | "SCRAP">>({});
  const [refundReason, setRefundReason] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const endpoint = kind === "purchase" ? "/api/purchases" : "/api/sales";

  const loadOrder = useCallback(async () => {
    const response = await fetch(`${endpoint}/${id}`);
    const order = await response.json();
    if (!response.ok) throw new Error(order.error || "載入單據失敗");
    setData(order);
    setPaymentReference(order.storefrontPayment?.providerReference ?? "");
    setRefundQty(Object.fromEntries((order.items ?? []).map((item: any) => [item.id, 0])));
    setRefundDisposition(Object.fromEntries((order.items ?? []).map((item: any) => [item.id, "SELLABLE"])));
    const progressField = kind === "purchase" ? "receivedQty" : "shippedQty";
    setFulfillQty(Object.fromEntries((order.items ?? []).map((item: any) => [
      item.id,
      Math.max(0, Math.round((Number(item.quantity) - Number(item[progressField] ?? 0)) * 10_000) / 10_000),
    ])));
  }, [endpoint, id, kind]);

  useEffect(() => {
    loadOrder().catch((error) => toast.error(error.message));
    fetch(`/api/warehouses`).then((r) => r.json()).then((d) => {
      setWarehouses(d.items ?? []);
      if (d.items?.[0]) setWarehouseId(d.items[0].id);
    });
  }, [loadOrder]);

  async function act(action: string) {
    const isFulfillment = action === "receive" || action === "ship";
    const selectedItems = isFulfillment
      ? (data?.items ?? []).map((item: any) => ({
          orderItemId: item.id,
          quantity: Number(fulfillQty[item.id] ?? 0),
        })).filter((item: any) => Number.isFinite(item.quantity) && item.quantity > 0)
      : undefined;
    try {
      if (isFulfillment && !warehouseId) throw new Error("請選擇處理倉庫");
      if (isFulfillment && !selectedItems?.length) throw new Error("請至少輸入一筆本次數量");
      setBusyAction(action);
      const res = await fetch(`${endpoint}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          warehouseId,
          items: selectedItems,
          remark: fulfillmentRemark || undefined,
          providerReference: action === "confirm_payment" ? paymentReference.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      const result = await res.json();
      if (result.message) {
        toast.success(result.message);
      } else {
        toast.success("已處理");
      }
      onChanged();
      if ((isFulfillment && !result.complete) || action === "confirm_payment") {
        setFulfillmentRemark("");
        await loadOrder();
      } else {
        onClose();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function submitStorefrontRefund() {
    if (!data) return;
    const items = data.items.map((item: any) => ({
      orderItemId: item.id,
      quantity: Number(refundQty[item.id] ?? 0),
      disposition: refundDisposition[item.id] || "SELLABLE",
    })).filter((item: any) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (!items.length) return toast.error("請至少輸入一筆退款數量");
    if (refundReason.trim().length < 2) return toast.error("請輸入至少 2 個字的退款原因");
    if (refundReference.trim().length < 2) return toast.error("請輸入金流退款序號或人工退款憑證");
    setBusyAction("refund");
    try {
      const response = await fetch(`/api/sales/${id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, reason: refundReason.trim(), refundReference: refundReference.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "退款失敗");
      toast.success(result.message || "退款完成");
      setRefundOpen(false);
      setRefundReason("");
      setRefundReference("");
      onChanged();
      await loadOrder();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  if (!data) return null;
  const party = kind === "purchase" ? data.supplier : data.customer;
  const progressField = kind === "purchase" ? "receivedQty" : "shippedQty";
  const partialStatus = kind === "purchase" ? "PARTIALLY_RECEIVED" : "PARTIALLY_SHIPPED";
  const canReceiveShip = data.status === "APPROVED" || data.status === partialStatus;
  const fulfillmentDocs = kind === "purchase" ? (data.receipts ?? []) : (data.shipments ?? []);
  const storefrontPayment = kind === "sales" ? data.storefrontPayment : null;
  const refundablePayment = storefrontPayment && ["PAID", "PARTIALLY_REFUNDED"].includes(storefrontPayment.status);
  const canStorefrontRefund = Boolean(refundablePayment && ["PARTIALLY_SHIPPED", "POSTED"].includes(data.status) && data.items.some((item: any) => Number(item.shippedQty) - Number(item.returnedQty ?? 0) > 0.00001));
  const refundEstimate = Math.round(data.items.reduce((sum: number, item: any) => {
    const quantity = Number(refundQty[item.id] ?? 0);
    const ratio = Number(item.quantity) > 0 ? quantity / Number(item.quantity) : 0;
    return sum + (quantity * Number(item.unitPrice) - Number(item.discount ?? 0) * ratio) * (1 + Number(item.taxRate ?? 0));
  }, 0) * 100) / 100;

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

        {storefrontPayment && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold flex items-center gap-2"><CreditCard className="h-4 w-4" />電商付款</div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{storefrontPayment.method}・{storefrontPayment.status === "PAID" ? "已付款" : storefrontPayment.status === "PARTIALLY_REFUNDED" ? "部分退款" : storefrontPayment.status === "REFUNDED" ? "已全額退款" : storefrontPayment.status}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 text-xs"><div>原付款 <strong>{formatMoney(storefrontPayment.amount)}</strong></div><div>已退款 <strong className="text-rose-700">{formatMoney(storefrontPayment.refundedAmount ?? 0)}</strong></div><div>付款憑證 <strong>{storefrontPayment.providerReference || "尚未確認"}</strong></div></div>
            {!["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED", "EXPIRED"].includes(storefrontPayment.status) && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="付款交易序號／轉帳憑證" disabled={busyAction !== null} />
                <Button disabled={busyAction !== null || paymentReference.trim().length < 2} onClick={() => act("confirm_payment")}><CreditCard className="h-4 w-4" />確認已收款</Button>
              </div>
            )}
            <div className="text-xs text-indigo-800">確認付款後，出貨會自動入銀行、沖應收並建立傳票；未收款訂單請作廢，不要使用退款。</div>
          </div>
        )}

        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left whitespace-nowrap">SKU</th>
                <th className="p-2 text-left whitespace-nowrap">商品</th>
                <th className="p-2 text-right whitespace-nowrap">訂購量</th>
                <th className="p-2 text-right whitespace-nowrap">已{kind === "purchase" ? "進" : "出"}</th>
                <th className="p-2 text-right whitespace-nowrap">未交量</th>
                {canReceiveShip && <th className="p-2 text-right whitespace-nowrap">本次{kind === "purchase" ? "進貨" : "出貨"}</th>}
                <th className="p-2 text-right whitespace-nowrap">單價</th>
                <th className="p-2 text-right whitespace-nowrap">小計</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i: any) => {
                const ordered = Number(i.quantity);
                const fulfilled = Number(i[progressField] ?? 0);
                const remaining = Math.max(0, Math.round((ordered - fulfilled) * 10_000) / 10_000);
                return (
                  <tr key={i.id} className="border-t">
                    <td className="p-2 font-mono text-xs whitespace-nowrap">{i.product?.sku}</td>
                    <td className="p-2 whitespace-nowrap">{i.product?.name}</td>
                    <td className="p-2 text-right whitespace-nowrap">{ordered}</td>
                    <td className="p-2 text-right whitespace-nowrap">{fulfilled}</td>
                    <td className="p-2 text-right whitespace-nowrap font-medium">{remaining}</td>
                    {canReceiveShip && (
                      <td className="p-2">
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          step="0.0001"
                          disabled={remaining <= 0 || busyAction !== null}
                          value={fulfillQty[i.id] ?? ""}
                          onChange={(event) => setFulfillQty((previous) => ({ ...previous, [i.id]: event.target.value }))}
                          className="h-8 w-28 text-right ml-auto"
                        />
                      </td>
                    )}
                    <td className="p-2 text-right whitespace-nowrap">{formatMoney(i.unitPrice)}</td>
                    <td className="p-2 text-right whitespace-nowrap">{formatMoney(i.subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data.remark && <div className="text-sm"><span className="text-muted-foreground">備註：</span>{data.remark}</div>}

        {canReceiveShip && (
          <div className="border-t pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>本次處理倉庫</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={warehouseId}
                disabled={busyAction !== null}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>本次備註</Label>
              <Input
                value={fulfillmentRemark}
                disabled={busyAction !== null}
                onChange={(event) => setFulfillmentRemark(event.target.value)}
                placeholder={kind === "purchase" ? "例如：第一批到貨" : "例如：第一批出貨"}
              />
            </div>
          </div>
        )}

        {fulfillmentDocs.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <Label>{kind === "purchase" ? "進貨驗收紀錄" : "出貨紀錄"}</Label>
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">單號</th>
                    <th className="p-2 text-left">日期</th>
                    <th className="p-2 text-left">倉庫</th>
                    <th className="p-2 text-right">本次數量</th>
                    <th className="p-2 text-right">本次金額</th>
                  </tr>
                </thead>
                <tbody>
                  {fulfillmentDocs.map((doc: any) => (
                    <tr key={doc.id} className="border-t">
                      <td className="p-2 font-mono text-xs">{doc.number}</td>
                      <td className="p-2">{formatDate(kind === "purchase" ? doc.receiptDate : doc.shipmentDate)}</td>
                      <td className="p-2">{doc.warehouse?.code} - {doc.warehouse?.name}</td>
                      <td className="p-2 text-right">{doc.items?.reduce((sum: number, item: any) => sum + Number(item.quantity), 0)}</td>
                      <td className="p-2 text-right">{formatMoney(doc.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {kind === "sales" && data.returns?.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <Label>退貨／退款歷史</Label>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/50 text-xs"><tr><th className="p-2 text-left">退貨單</th><th className="p-2 text-left">日期</th><th className="p-2 text-left">原因／退款憑證</th><th className="p-2 text-right">金額</th></tr></thead><tbody>{data.returns.map((item: any) => <tr key={item.id} className="border-t"><td className="p-2 font-mono text-xs">{item.number}</td><td className="p-2">{formatDate(item.returnDate)}</td><td className="p-2">{item.reason || "—"}<div className="text-xs text-muted-foreground">{item.refundReference || "—"}</div></td><td className="p-2 text-right text-rose-700">{formatMoney(item.total)}</td></tr>)}</tbody></table>
            </div>
          </div>
        )}

        {refundOpen && storefrontPayment && (
          <div className="space-y-4 rounded-xl border-2 border-rose-300 bg-rose-50/40 p-4">
            <div><div className="font-bold flex items-center gap-2"><RotateCcw className="h-4 w-4" />電商原交易退款</div><div className="mt-1 text-xs text-muted-foreground">只能退已出貨且尚未退回的數量；良品回庫，瑕疵／報廢不回可售庫存。</div></div>
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full min-w-[820px] text-sm"><thead className="bg-muted/50 text-xs"><tr><th className="p-2 text-left">商品</th><th className="p-2 text-right">已出</th><th className="p-2 text-right">已退</th><th className="p-2 text-right">可退</th><th className="p-2 text-right">本次</th><th className="p-2 text-left">品況</th></tr></thead><tbody>{data.items.map((item: any) => {
                const remaining = Math.max(0, Math.round((Number(item.shippedQty) - Number(item.returnedQty ?? 0)) * 10_000) / 10_000);
                return <tr key={item.id} className="border-t"><td className="p-2"><div className="font-medium">{item.product?.name}</div><div className="font-mono text-xs text-muted-foreground">{item.product?.sku}</div></td><td className="p-2 text-right">{Number(item.shippedQty)}</td><td className="p-2 text-right">{Number(item.returnedQty ?? 0)}</td><td className="p-2 text-right font-semibold">{remaining}</td><td className="p-2"><Input type="number" min="0" max={remaining} step="0.0001" value={refundQty[item.id] ?? 0} disabled={remaining <= 0 || busyAction !== null} onChange={(event) => setRefundQty((current) => ({ ...current, [item.id]: event.target.value }))} className="ml-auto h-8 w-28 text-right" /></td><td className="p-2"><select value={refundDisposition[item.id] || "SELLABLE"} onChange={(event) => setRefundDisposition((current) => ({ ...current, [item.id]: event.target.value as any }))} disabled={remaining <= 0 || busyAction !== null} className="h-8 rounded-md border bg-background px-2"><option value="SELLABLE">良品／回可售庫存</option><option value="DAMAGED">瑕疵／不回庫</option><option value="SCRAP">報廢／不回庫</option></select></td></tr>;
              })}</tbody></table>
            </div>
            <div className="grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label>退款原因</Label><Textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="例如：客戶取消、商品瑕疵" disabled={busyAction !== null} /></div><div className="space-y-1"><Label>金流退款序號／人工退款憑證</Label><Input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} placeholder="必填，供對帳與稽核" disabled={busyAction !== null} /><div className="text-sm">本次預估退款 <strong className="text-rose-700">{formatMoney(refundEstimate)}</strong></div></div></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRefundOpen(false)} disabled={busyAction !== null}>取消</Button><Button variant="destructive" onClick={submitStorefrontRefund} disabled={busyAction !== null || refundEstimate <= 0}>{busyAction === "refund" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}確認退款並過帳</Button></div>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap flex-col-reverse md:flex-row">
          <Button
            variant="outline"
            onClick={() => window.open(`/print/${kind === "purchase" ? "purchase" : "sales"}/${data.id}`, "_blank")}
          >
            <Printer className="h-4 w-4" />列印
          </Button>
          {(data.status === "DRAFT" || data.status === "REJECTED") && <Button variant="outline" onClick={() => act("submit")}>送出</Button>}
          {data.status === "SUBMITTED" && (
            <>
              <Button variant="outline" onClick={() => act("approve")}>審核</Button>
              <Button variant="destructive" onClick={() => act("reject")}>駁回</Button>
            </>
          )}
          {canStorefrontRefund && !refundOpen && (
            <Button variant="destructive" disabled={busyAction !== null} onClick={() => setRefundOpen(true)}><RotateCcw className="h-4 w-4" />原交易退款</Button>
          )}
          {canReceiveShip && (
            <Button disabled={busyAction !== null} onClick={() => act(kind === "purchase" ? "receive" : "ship")}>
              {busyAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {kind === "purchase" ? "確認本次進貨" : "確認本次出貨"}
            </Button>
          )}
          {!['VOIDED', 'POSTED', 'PARTIALLY_RECEIVED', 'PARTIALLY_SHIPPED'].includes(data.status) && (
            <Button variant="destructive" onClick={() => act("cancel")}>作廢</Button>
          )}
          {(data.status === "DRAFT" || data.status === "REJECTED") && (
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
