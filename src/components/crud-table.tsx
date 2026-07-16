"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/page-shell";
import { Plus, Search, Loader2, Trash2, Download, Printer, FileDown, FileSpreadsheet, Upload, Settings2, Save, X, Pencil, Copy, ClipboardPaste, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV, toCSV } from "@/lib/csv";
import { readSessionCache, TableHint, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";
import {
  useCustomColumns,
  useCustomFieldValues,
  CustomColumnDialog,
  CustomFieldGridCell,
  type CustomColumn,
} from "@/components/custom-columns";

function ImportBtn({
  endpoint,
  importMap,
  templateHeaders,
  templateName,
  onDone,
}: {
  endpoint: string;
  importMap: (row: Record<string, any>) => Record<string, any> | null;
  templateHeaders?: string[];
  templateName?: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputId = useState(() => `xlsx-import-${Math.random().toString(36).slice(2)}`)[0];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { readExcelFile } = await import("@/lib/excel");
      const rows = await readExcelFile(file);
      let success = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const payload = importMap(rows[i]);
        if (!payload) continue;
        try {
          const sep = endpoint.includes("?") ? "&" : "?";
          const r = await fetch(`${endpoint}${sep}upsert=1`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            errors.push(`第 ${i + 2} 列：${j.error || r.statusText}`);
          } else success++;
        } catch (err: any) {
          errors.push(`第 ${i + 2} 列：${err.message}`);
        }
      }
      if (errors.length === 0) toast.success(`已匯入 ${success} 筆`);
      else toast.error(`成功 ${success} / 失敗 ${errors.length}\n${errors.slice(0, 3).join("\n")}`);
      onDone();
    } catch (err: any) {
      toast.error(err.message || "匯入失敗");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function downloadTpl() {
    if (!templateHeaders) return;
    const { downloadExcelTemplate } = await import("@/lib/excel");
    downloadExcelTemplate(templateName ?? "template", "資料", templateHeaders);
  }

  return (
    <>
      <input id={inputId} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      <Button variant="outline" disabled={busy} onClick={() => document.getElementById(inputId)?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        匯入
      </Button>
      {templateHeaders && (
        <Button variant="ghost" size="sm" onClick={downloadTpl}>
          範本
        </Button>
      )}
    </>
  );
}

function PDFBtn({ title, filename }: { title: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { exportPageToPDF } = await import("@/lib/export-pdf");
          await exportPageToPDF(title, filename);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      PDF
    </Button>
  );
}

export type Column<T> = {
  key: string;
  title: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  csv?: (row: T) => any; // CSV 匯出值 (若未提供則用 row[key])
  isImage?: boolean; // 標記此欄位為圖片欄位（用於 Excel 匯出）
  isUrl?: boolean; // 標記此欄位為 URL 欄位（用於 Excel 匯出創建超連結）
  /** 欄位可行內編輯; type: text|number|select; options: select 選項 */
  editable?: { type: "text" | "number" | "select"; options?: { value: string; label: string }[] };
};

function TableSkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TR key={rowIndex}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <TD key={colIndex}>
              <div className={`h-4 animate-pulse rounded bg-muted ${colIndex === 0 ? "w-16" : colIndex === columns - 1 ? "ml-auto w-20" : "w-full"}`} />
            </TD>
          ))}
        </TR>
      ))}
    </>
  );
}

export function CrudTable<T extends { id: string }>({
  endpoint,
  columns,
  searchPlaceholder = "搜尋...",
  canCreate = true,
  canEdit = true,
  canDelete = true,
  FormDialog,
  initialQuery,
  exportable = true,
  exportName = "export",
  pdfTitle = "",
  importMap,
  importEndpoint,
  templateHeaders,
  enableDateFilter = false,
  moduleKey,
  inlineEdit = false,
  enableEnterToCreate = false,
  serverExcelExport,
}: {
  endpoint: string;
  columns: Column<T>[];
  searchPlaceholder?: string;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  exportable?: boolean;
  exportName?: string;
  pdfTitle?: string;
  /** 匯入時將 Excel 一列轉換為 API payload */
  importMap?: (row: Record<string, any>) => Record<string, any> | null;
  /** 匯入 API endpoint（預設=endpoint POST） */
  importEndpoint?: string;
  /** Excel 範本表頭 */
  templateHeaders?: string[];
  FormDialog: React.FC<{ open: boolean; onClose: () => void; row: T | null; onSaved: () => void }>;
  initialQuery?: Record<string, string>;
  enableDateFilter?: boolean;
  /** 用於自訂欄位的模組 key */
  moduleKey?: string;
  /** 啟用行內編輯模式（不跳出 Dialog） */
  inlineEdit?: boolean;
  /** 啟用 Enter 在最後一行時新增一行 */
  enableEnterToCreate?: boolean;
  /** 若提供，Excel 匯出改用此 server 端 endpoint（可真正嵌入圖片）。會帶上 q/from/to 查詢參數 */
  serverExcelExport?: string;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editing, setEditing] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  const customCols = useCustomColumns(moduleKey || exportName);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  // 單格編輯追蹤 (像真正 Excel)
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: T; colKey: string } | null>(null);
  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number; colKey: string } | null>(null);

  useEffect(() => {
    if (!contextMenu && !columnMenu) return;
    const close = () => { setContextMenu(null); setColumnMenu(null); };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu, columnMenu]);

  // 欄位順序管理（拖曳表頭排序）
  const colOrderKey = `erp_col_order_${moduleKey || exportName}`;
  const [colOrder, setColOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return columns.map((c) => c.key);
    try {
      const saved = localStorage.getItem(colOrderKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        // 確保涵蓋所有欄位
        const allKeys = columns.map((c) => c.key);
        const valid = parsed.filter((k) => allKeys.includes(k));
        const missing = allKeys.filter((k) => !valid.includes(k));
        return [...valid, ...missing];
      }
    } catch {}
    return columns.map((c) => c.key);
  });
  const [dragCol, setDragCol] = useState<string | null>(null);
  const hiddenColsKey = `erp_hidden_cols_${moduleKey || exportName}`;
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(hiddenColsKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  function hideColumn(key: string) {
    const next = [...new Set([...hiddenColumns, key])];
    setHiddenColumns(next);
    localStorage.setItem(hiddenColsKey, JSON.stringify(next));
  }

  function restoreColumns() {
    setHiddenColumns([]);
    localStorage.removeItem(hiddenColsKey);
  }

  function saveColOrder(order: string[]) {
    setColOrder(order);
    localStorage.setItem(colOrderKey, JSON.stringify(order));
  }

  function handleDragStart(key: string) { setDragCol(key); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(targetKey: string) {
    if (!dragCol || dragCol === targetKey) { setDragCol(null); return; }
    const order = [...colOrder];
    const fromIdx = order.indexOf(dragCol);
    const toIdx = order.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) { setDragCol(null); return; }
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragCol);
    saveColOrder(order);
    setDragCol(null);
  }

  // 依據 colOrder 排序 columns
  const orderedColumns = useMemo(() => [...columns].sort((a, b) => colOrder.indexOf(a.key) - colOrder.indexOf(b.key)), [columns, colOrder]);
  const visibleColumns = useMemo(() => orderedColumns.filter((column) => !hiddenColumns.includes(column.key)), [hiddenColumns, orderedColumns]);

  // SWR fetcher
  const fetcher = useCallback(async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json()).error || "載入失敗");
    return res.json();
  }, []);

  // 構建 SWR key
  const swrKey = useCallback(() => {
    const params = new URLSearchParams({ q: debouncedQ, page: String(page), pageSize: String(pageSize), ...(initialQuery ?? {}) });
    if (enableDateFilter && fromDate) params.set("from", fromDate);
    if (enableDateFilter && toDate) params.set("to", toDate);
    return `${endpoint}?${params.toString()}`;
  }, [endpoint, debouncedQ, page, initialQuery, enableDateFilter, fromDate, toDate]);

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
  const customFieldValues = useCustomFieldValues(moduleKey || exportName, rows.map((row: T) => row.id));
  const tableColumnCount = visibleColumns.length + customCols.columns.length + ((canEdit || canDelete) ? 1 : 0);
  const showInitialLoading = isLoading && !data;
  const showRefreshing = isValidating && !!data && !isLoading;

  async function onDelete(row: T) {
    if (!confirm("確定要刪除？")) return;
    try {
      const res = await fetch(`${endpoint}/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "刪除失敗");
      toast.success("已刪除");
      mutate(swrKey());
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function startInlineEdit(row: T) {
    const draft: Record<string, any> = {};
    columns.forEach((c) => { if (c.editable) draft[c.key] = (row as any)[c.key] ?? ""; });
    setInlineEditing((prev) => ({ ...prev, [row.id]: draft }));
  }

  // 進入單格編輯（點擊某個 cell）
  function startCellEdit(row: T, colKey: string, savePrevious = true) {
    if (!canEdit) return;
    if (savePrevious && activeCell?.rowId && activeCell.rowId !== row.id) {
      const previousRow = rows.find((candidate: T) => candidate.id === activeCell.rowId) as T | undefined;
      if (previousRow) void saveInlineEdit(previousRow, { silent: true, revalidate: false });
    }
    if (!inlineEditing[row.id]) {
      const draft: Record<string, any> = {};
      columns.forEach((c) => { if (c.editable) draft[c.key] = (row as any)[c.key] ?? ""; });
      setInlineEditing((prev) => ({ ...prev, [row.id]: draft }));
    }
    setActiveCell({ rowId: row.id, colKey });
  }

  function clipboardValue(column: Column<T>, row: T) {
    const raw = column.csv ? column.csv(row) : (row as any)[column.key];
    return raw == null ? "" : String(raw);
  }

  function normalizePastedValue(column: Column<T>, value: string) {
    const trimmed = value.trim();
    if (column.editable?.type === "select") {
      return column.editable.options?.find((option) => option.label === trimmed || option.value === trimmed)?.value ?? trimmed;
    }
    return trimmed;
  }

  async function copyCell(row: T, colKey: string) {
    const column = visibleColumns.find((candidate) => candidate.key === colKey);
    if (!column) return;
    await navigator.clipboard.writeText(clipboardValue(column, row));
    toast.success("已複製儲存格");
  }

  async function copyRow(row: T) {
    await navigator.clipboard.writeText(visibleColumns.map((column) => clipboardValue(column, row)).join("\t"));
    toast.success("已複製整列，可貼到 Excel");
  }

  async function pasteGrid(startRow: T, startColKey: string, text: string) {
    if (!canEdit) return;
    const editableCols = visibleColumns.filter((column) => column.editable);
    const startRowIdx = rows.findIndex((row: T) => row.id === startRow.id);
    const startColIdx = editableCols.findIndex((column) => column.key === startColKey);
    if (startRowIdx < 0 || startColIdx < 0 || !text) return;
    const normalized = text.replace(/\r/g, "").replace(/\n$/, "");
    const matrix = normalized.split("\n").map((line) => line.split("\t"));
    const affected = new Map<string, { row: T; values: Record<string, unknown> }>();
    matrix.forEach((line, rowOffset) => {
      const targetRow = rows[startRowIdx + rowOffset] as T | undefined;
      if (!targetRow) return;
      line.forEach((value, colOffset) => {
        const targetColumn = editableCols[startColIdx + colOffset];
        if (!targetColumn) return;
        const current = affected.get(targetRow.id) ?? { row: targetRow, values: {} };
        current.values[targetColumn.key] = normalizePastedValue(targetColumn, value);
        affected.set(targetRow.id, current);
      });
    });
    if (affected.size === 0) return;
    const optimisticValues = new Map([...affected.entries()].map(([rowId, update]) => [rowId, update.values]));
    setInlineEditing({});
    const lastRowIdx = Math.min(rows.length - 1, startRowIdx + matrix.length - 1);
    const lastColIdx = Math.min(editableCols.length - 1, startColIdx + Math.max(...matrix.map((line) => line.length)) - 1);
    setActiveCell({ rowId: rows[lastRowIdx].id, colKey: editableCols[lastColIdx].key });
    void mutate(swrKey(), (current: any) => current ? {
      ...current,
      items: current.items.map((row: T) => optimisticValues.has(row.id) ? { ...row, ...optimisticValues.get(row.id) } : row),
    } : current, { revalidate: false });
    setInlineSaving(startRow.id);
    try {
      await Promise.all([...affected.values()].map(async (update) => {
        const response = await fetch(`${endpoint}/${update.row.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(update.row as any), ...update.values }),
        });
        if (!response.ok) throw new Error((await response.json()).error || "貼上失敗");
      }));
      void mutate(swrKey());
      toast.success(`已貼上 ${affected.size} 列資料`);
    } catch (error: any) {
      void mutate(swrKey());
      toast.error(error.message || "貼上失敗");
    } finally {
      setInlineSaving(null);
    }
  }

  // 鍵盤導航：Enter/下移、上下左右移動、Tab 右移、Escape 取消
  function handleCellKeyDown(e: React.KeyboardEvent, row: T, colKey: string) {
    const editableCols = visibleColumns.filter((c) => c.editable);
    const rowIdx = rows.findIndex((r: T) => r.id === row.id);
    const colIdx = editableCols.findIndex((c) => c.key === colKey);
    if (editableCols.length === 0 || colIdx === -1) return;

    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (enableEnterToCreate && rowIdx === rows.length - 1 && e.key === "Enter") {
        // 在最後一行按 Enter，新增一行
        createNewRow(colKey);
      } else {
        saveCellAndMove(row, rowIdx + 1, colKey);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      saveCellAndMove(row, rowIdx - 1, colKey);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      if (colIdx < editableCols.length - 1) {
        setActiveCell({ rowId: row.id, colKey: editableCols[colIdx + 1].key });
      } else if (rowIdx < rows.length - 1) {
        saveCellAndMove(row, rowIdx + 1, editableCols[0].key);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      if (colIdx > 0) {
        setActiveCell({ rowId: row.id, colKey: editableCols[colIdx - 1].key });
      } else if (rowIdx > 0) {
        saveCellAndMove(row, rowIdx - 1, editableCols[editableCols.length - 1].key);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        // Shift+Tab 往左
        if (colIdx > 0) {
          setActiveCell({ rowId: row.id, colKey: editableCols[colIdx - 1].key });
        } else if (rowIdx > 0) {
          // 上一行最後一個
          saveCellAndMove(row, rowIdx - 1, editableCols[editableCols.length - 1].key);
        }
      } else {
        // Tab 往右
        if (colIdx < editableCols.length - 1) {
          setActiveCell({ rowId: row.id, colKey: editableCols[colIdx + 1].key });
        } else if (rowIdx < rows.length - 1) {
          // 下一行第一個
          saveCellAndMove(row, rowIdx + 1, editableCols[0].key);
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelInlineEdit(row.id);
      setActiveCell(null);
    }
  }

  async function createNewRow(startColKey: string) {
    if (!canCreate) return;
    // 先儲存當前行
    await saveInlineEdit(rows[rows.length - 1]);
    // 開啟新增對話框
    setEditing(null);
    setOpen(true);
  }

  function saveCellAndMove(currentRow: T, targetRowIdx: number, targetColKey: string) {
    // 先移動游標，儲存改在背景完成；網路延遲不阻擋連續輸入。
    if (targetRowIdx >= 0 && targetRowIdx < rows.length) {
      const targetRow = rows[targetRowIdx];
      startCellEdit(targetRow as T, targetColKey, false);
    } else {
      setActiveCell(null);
    }
    void saveInlineEdit(currentRow, { silent: true, revalidate: false });
  }

  async function saveInlineEdit(row: T, options: { silent?: boolean; revalidate?: boolean } = {}) {
    const draft = inlineEditing[row.id];
    if (!draft) return;
    if (!options.silent) setInlineSaving(row.id);
    try {
      const payload = { ...(row as any), ...draft };
      const res = await fetch(`${endpoint}/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const saved = await res.json().catch(() => null);
      if (!options.silent) toast.success("已儲存");
      setInlineEditing((prev) => {
        if (prev[row.id] !== draft) return prev;
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      if (saved) {
        void mutate(swrKey(), (current: any) => current ? {
          ...current,
          items: current.items.map((item: T) => item.id === row.id ? { ...item, ...saved } : item),
        } : current, { revalidate: options.revalidate ?? false });
      } else if (options.revalidate) {
        void mutate(swrKey());
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      if (!options.silent) setInlineSaving(null);
    }
  }

  function cancelInlineEdit(rowId: string) {
    setInlineEditing((prev) => { const n = { ...prev }; delete n[rowId]; return n; });
    if (activeCell?.rowId === rowId) setActiveCell(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              className="pl-9 w-72"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </div>
          {enableDateFilter && (
            <>
              <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
              <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PDFBtn title={pdfTitle || exportName} filename={exportName} />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            列印
          </Button>
          {exportable && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    if (serverExcelExport) {
                      // server 端匯出（可真正嵌入圖片），透過 blob 觸發下載
                      const params = new URLSearchParams({ ...(initialQuery ?? {}) });
                      if (q) params.set("q", q);
                      if (enableDateFilter && fromDate) params.set("from", fromDate);
                      if (enableDateFilter && toDate) params.set("to", toDate);
                      const res = await fetch(`${serverExcelExport}?${params.toString()}`);
                      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "匯出失敗");
                      const blob = await res.blob();
                      const cd = res.headers.get("Content-Disposition") || "";
                      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
                      const filename = m ? decodeURIComponent(m[1]) : `${exportName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
                    const params = new URLSearchParams({ q, page: "1", pageSize: "10000", ...(initialQuery ?? {}) });
                    if (enableDateFilter && fromDate) params.set("from", fromDate);
                    if (enableDateFilter && toDate) params.set("to", toDate);
                    const res = await fetch(`${endpoint}?${params.toString()}`);
                    const data = await res.json();
                    const { downloadExcel } = await import("@/lib/excel");
                    downloadExcel(
                      exportName,
                      pdfTitle || exportName,
                      data.items,
                      visibleColumns.map((c) => ({ key: c.key, title: c.title, get: c.csv, isImage: c.isImage, isUrl: c.isUrl })) as any
                    );
                    toast.success("已匯出 Excel");
                  } catch (e: any) {
                    toast.error(e.message || "匯出失敗");
                  }
                }}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const params = new URLSearchParams({ q, page: "1", pageSize: "10000", ...(initialQuery ?? {}) });
                    if (enableDateFilter && fromDate) params.set("from", fromDate);
                    if (enableDateFilter && toDate) params.set("to", toDate);
                    const res = await fetch(`${endpoint}?${params.toString()}`);
                    const data = await res.json();
                    const csv = toCSV(
                      data.items,
                      visibleColumns.map((c) => ({ key: c.key, title: c.title, get: c.csv })) as any
                    );
                    downloadCSV(`${exportName}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
                    toast.success("已匯出 CSV");
                  } catch (e: any) {
                    toast.error(e.message || "匯出失敗");
                  }
                }}
              >
                <Download className="h-4 w-4" />
                CSV
              </Button>
            </>
          )}
          {importMap && (
            <ImportBtn
              endpoint={importEndpoint || endpoint}
              importMap={importMap}
              templateHeaders={templateHeaders}
              templateName={exportName}
              onDone={() => mutate(swrKey())}
            />
          )}
          {moduleKey && (
            <Button variant="outline" onClick={() => customCols.setOpen(true)}>
              <Settings2 className="h-4 w-4" />
              欄位
            </Button>
          )}
          {canCreate && (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              新增
            </Button>
          )}
        </div>
      </div>

      <TableHint />
      <Table>
        <THead>
          <TR>
            {visibleColumns.map((c) => (
              <TH
                key={c.key}
                className={`${c.className ?? ""} cursor-grab select-none hover:text-foreground ${dragCol === c.key ? "bg-muted opacity-70" : ""}`}
                draggable
                onDragStart={() => handleDragStart(c.key)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(c.key)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu(null);
                  setColumnMenu({ x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 190), colKey: c.key });
                }}
                title="拖曳調整欄位順序"
              >
                {c.title}
              </TH>
            ))}
            {customCols.columns.map((cc) => (
              <TH
                key={cc.id}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu(null);
                  customCols.setOpen(true);
                }}
                title="按右鍵管理自訂欄位"
              >
                {cc.label}
              </TH>
            ))}
            {(canEdit || canDelete) && <TH className="w-28 text-right">操作</TH>}
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
            rows.map((row: T, rowIndex: number) => {
              const draft = inlineEditing[row.id];
              const isRowEditing = !!draft;
              return (
              <TR key={row.id} className={isRowEditing ? "bg-accent/5" : ""}>
                {visibleColumns.map((c) => {
                  const isCellActive = activeCell?.rowId === row.id && activeCell?.colKey === c.key;
                  const showInput = isRowEditing && c.editable && isCellActive;
                  return (
                  <TD
                    key={c.key}
                    className={`${c.className ?? ""} ${canEdit && c.editable ? "cursor-cell transition-colors hover:bg-muted/60" : ""} ${isCellActive ? "ring-2 ring-ring ring-inset" : ""}`}
                    onClick={() => { if (canEdit && c.editable) startCellEdit(row, c.key); }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setActiveCell({ rowId: row.id, colKey: c.key });
                      setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 220), row, colKey: c.key });
                    }}
                  >
                    {showInput ? (
                      c.editable!.type === "select" ? (
                        <select
                          value={draft[c.key] ?? ""}
                          autoFocus
                          onChange={(e) => setInlineEditing((prev) => ({ ...prev, [row.id]: { ...prev[row.id], [c.key]: e.target.value } }))}
                          onKeyDown={(e) => handleCellKeyDown(e, row, c.key)}
                          onPaste={(event) => {
                            const text = event.clipboardData.getData("text/plain");
                            if (text.includes("\t") || /[\r\n]/.test(text)) {
                              event.preventDefault();
                              void pasteGrid(row, c.key, text);
                            }
                          }}
                          onBlur={() => { /* 保持焦點管理由 keyboard 處理 */ }}
                          className="h-8 w-full rounded border-0 bg-transparent px-1 text-sm focus:outline-none"
                          ref={(el) => { if (el) el.focus(); }}
                        >
                          {c.editable!.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <Input
                          type={c.editable!.type}
                          step={c.editable!.type === "number" ? "1" : undefined}
                          value={draft[c.key] ?? ""}
                          autoFocus
                          onChange={(e) => setInlineEditing((prev) => ({ ...prev, [row.id]: { ...prev[row.id], [c.key]: e.target.value } }))}
                          className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                          onKeyDown={(e) => handleCellKeyDown(e, row, c.key)}
                          onPaste={(event) => {
                            const text = event.clipboardData.getData("text/plain");
                            if (text.includes("\t") || /[\r\n]/.test(text)) {
                              event.preventDefault();
                              void pasteGrid(row, c.key, text);
                            }
                          }}
                          ref={(el) => { if (el) el.focus(); }}
                        />
                      )
                    ) : isRowEditing && c.editable ? (
                      <span className="block px-1 py-1 text-sm min-h-[32px] leading-8">{draft[c.key] ?? "—"}</span>
                    ) : (
                      c.render ? c.render(row) : (row as any)[c.key] ?? "—"
                    )}
                  </TD>
                  );
                })}
                {customCols.columns.map((cc, columnIndex) => {
                  const vals = customFieldValues.getValues(row.id);
                  return (
                    <TD key={cc.id} className="min-w-[100px]">
                      <CustomFieldGridCell
                        gridId={`crud-${moduleKey || exportName}`}
                        rowId={row.id}
                        rowIndex={rowIndex}
                        column={cc}
                        columnIndex={columnIndex}
                        rowIds={rows.map((item: T) => item.id)}
                        columns={customCols.columns}
                        value={vals[cc.id] ?? ""}
                        saveValues={customFieldValues.saveValues}
                        onManageColumns={() => customCols.setOpen(true)}
                      />
                    </TD>
                  );
                })}
                {(canEdit || canDelete) && (
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isRowEditing ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => { saveInlineEdit(row); setActiveCell(null); }} disabled={inlineSaving === row.id} title="儲存 (Enter)">
                            {inlineSaving === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-emerald-600" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => cancelInlineEdit(row.id)} title="取消 (Esc)">
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => { setEditing(row); setOpen(true); }} title="編輯">
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" onClick={() => onDelete(row)}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TD>
                )}
              </TR>
              );
            })}
        </TBody>
      </Table>

      {contextMenu && (() => {
        const column = visibleColumns.find((candidate) => candidate.key === contextMenu.colKey);
        const editable = Boolean(canEdit && column?.editable);
        return <div role="menu" aria-label="表格右鍵選單" className="fixed z-[100] w-52 rounded-lg border bg-popover p-1 text-sm shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { void copyCell(contextMenu.row, contextMenu.colKey); setContextMenu(null); }}><Copy className="h-4 w-4" />複製儲存格</button>
          <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { void copyRow(contextMenu.row); setContextMenu(null); }}><Copy className="h-4 w-4" />複製整列</button>
          <button type="button" disabled={!editable} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted disabled:opacity-40" onClick={async () => { const text = await navigator.clipboard.readText(); await pasteGrid(contextMenu.row, contextMenu.colKey, text); setContextMenu(null); }}><ClipboardPaste className="h-4 w-4" />從此格貼上</button>
          {canEdit && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { setEditing(contextMenu.row); setOpen(true); setContextMenu(null); }}><Pencil className="h-4 w-4" />編輯此筆</button>}
          {moduleKey && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { customCols.setOpen(true); setContextMenu(null); }}><Settings2 className="h-4 w-4" />新增／刪減自訂欄位</button>}
          {visibleColumns.length > 1 && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { hideColumn(contextMenu.colKey); setContextMenu(null); }}><EyeOff className="h-4 w-4" />隱藏此欄</button>}
          {hiddenColumns.length > 0 && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { restoreColumns(); setContextMenu(null); }}><RotateCcw className="h-4 w-4" />恢復隱藏欄位</button>}
          {canDelete && <><div className="my-1 border-t" /><button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-destructive hover:bg-destructive/10" onClick={() => { const row = contextMenu.row; setContextMenu(null); void onDelete(row); }}><Trash2 className="h-4 w-4" />刪除此筆</button></>}
        </div>;
      })()}

      {columnMenu && (() => {
        const column = visibleColumns.find((candidate) => candidate.key === columnMenu.colKey);
        if (!column) return null;
        return <div role="menu" aria-label="欄位右鍵選單" className="fixed z-[100] w-56 rounded-lg border bg-popover p-1 text-sm shadow-xl" style={{ left: columnMenu.x, top: columnMenu.y }} onClick={(event) => event.stopPropagation()}>
          {moduleKey && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { customCols.setOpen(true); setColumnMenu(null); }}><Settings2 className="h-4 w-4" />新增／刪減自訂欄位</button>}
          {visibleColumns.length > 1 && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { hideColumn(column.key); setColumnMenu(null); }}><EyeOff className="h-4 w-4" />隱藏「{column.title}」</button>}
          {hiddenColumns.length > 0 && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { restoreColumns(); setColumnMenu(null); }}><RotateCcw className="h-4 w-4" />恢復所有隱藏欄位</button>}
        </div>;
      })()}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          共 {total} 筆
          {showRefreshing && <span className="ml-2 text-xs text-muted-foreground">更新中...</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一頁
          </Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一頁
          </Button>
        </div>
      </div>

      <FormDialog open={open} onClose={() => setOpen(false)} row={editing} onSaved={() => mutate(swrKey())} />
      {moduleKey && (
        <CustomColumnDialog
          module={moduleKey || exportName}
          columns={customCols.columns}
          open={customCols.open}
          onClose={() => customCols.setOpen(false)}
          onSave={customCols.save}
        />
      )}
    </div>
  );
}
