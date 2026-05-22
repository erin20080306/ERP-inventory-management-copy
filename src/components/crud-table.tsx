"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/page-shell";
import { Plus, Search, Loader2, Edit2, Trash2, Download, Printer, FileDown, FileSpreadsheet, Upload, Settings2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV, toCSV } from "@/lib/csv";
import {
  useCustomColumns,
  CustomColumnDialog,
  getCustomFieldValues,
  setCustomFieldValue,
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
  /** 欄位可行內編輯; type: text|number|select; options: select 選項 */
  editable?: { type: "text" | "number" | "select"; options?: { value: string; label: string }[] };
};

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
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  const customCols = useCustomColumns(moduleKey || exportName);
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize), ...(initialQuery ?? {}) });
      if (enableDateFilter && fromDate) params.set("from", fromDate);
      if (enableDateFilter && toDate) params.set("to", toDate);
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error || "載入失敗");
      const data = await res.json();
      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, q, page, initialQuery, enableDateFilter, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete(row: T) {
    if (!confirm("確定要刪除？")) return;
    try {
      const res = await fetch(`${endpoint}/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "刪除失敗");
      toast.success("已刪除");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function startInlineEdit(row: T) {
    const draft: Record<string, any> = {};
    columns.forEach((c) => { if (c.editable) draft[c.key] = (row as any)[c.key] ?? ""; });
    setInlineEditing((prev) => ({ ...prev, [row.id]: draft }));
  }

  async function saveInlineEdit(row: T) {
    const draft = inlineEditing[row.id];
    if (!draft) return;
    setInlineSaving(row.id);
    try {
      const payload = { ...(row as any), ...draft };
      const res = await fetch(`${endpoint}/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
      setInlineEditing((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInlineSaving(null);
    }
  }

  function cancelInlineEdit(rowId: string) {
    setInlineEditing((prev) => { const n = { ...prev }; delete n[rowId]; return n; });
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
                      columns.map((c) => ({ key: c.key, title: c.title, get: c.csv })) as any
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
                      columns.map((c) => ({ key: c.key, title: c.title, get: c.csv })) as any
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
              onDone={load}
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

      <Table>
        <THead>
          <TR>
            {columns.map((c) => (
              <TH key={c.key} className={c.className}>
                {c.title}
              </TH>
            ))}
            {customCols.columns.map((cc) => (
              <TH key={cc.id}>{cc.label}</TH>
            ))}
            {(canEdit || canDelete) && <TH className="w-28 text-right">操作</TH>}
          </TR>
        </THead>
        <TBody>
          {loading && (
            <TR>
              <TD colSpan={columns.length + 1} className="text-center py-10">
                <Loader2 className="h-5 w-5 animate-spin inline-block" />
              </TD>
            </TR>
          )}
          {!loading && rows.length === 0 && (
            <TR>
              <TD colSpan={columns.length + 1}>
                <EmptyState />
              </TD>
            </TR>
          )}
          {!loading &&
            rows.map((row) => {
              const draft = inlineEditing[row.id];
              const isRowEditing = !!draft;
              return (
              <TR key={row.id} className={isRowEditing ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
                {columns.map((c) => (
                  <TD key={c.key} className={c.className}>
                    {isRowEditing && c.editable ? (
                      c.editable.type === "select" ? (
                        <select
                          value={draft[c.key] ?? ""}
                          onChange={(e) => setInlineEditing((prev) => ({ ...prev, [row.id]: { ...prev[row.id], [c.key]: e.target.value } }))}
                          className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                        >
                          {c.editable.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <Input
                          type={c.editable.type}
                          value={draft[c.key] ?? ""}
                          onChange={(e) => setInlineEditing((prev) => ({ ...prev, [row.id]: { ...prev[row.id], [c.key]: e.target.value } }))}
                          className="h-8 text-sm"
                          onKeyDown={(e) => { if (e.key === "Enter") saveInlineEdit(row); if (e.key === "Escape") cancelInlineEdit(row.id); }}
                        />
                      )
                    ) : (
                      c.render ? c.render(row) : (row as any)[c.key] ?? "—"
                    )}
                  </TD>
                ))}
                {customCols.columns.map((cc) => {
                  const cellKey = `${row.id}_${cc.id}`;
                  const vals = getCustomFieldValues(moduleKey || exportName, row.id);
                  const isCellEditing = editingCells[cellKey];
                  return (
                    <TD key={cc.id} className="min-w-[100px]">
                      {isCellEditing ? (
                        <Input
                          type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"}
                          defaultValue={vals[cc.id] ?? ""}
                          autoFocus
                          className="h-7 text-xs"
                          onBlur={(e) => {
                            setCustomFieldValue(moduleKey || exportName, row.id, cc.id, e.target.value);
                            setEditingCells((prev) => ({ ...prev, [cellKey]: false }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 px-1 py-0.5 rounded min-h-[24px] inline-block min-w-[40px]"
                          onClick={() => setEditingCells((prev) => ({ ...prev, [cellKey]: true }))}
                        >
                          {vals[cc.id] || "—"}
                        </span>
                      )}
                    </TD>
                  );
                })}
                {(canEdit || canDelete) && (
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isRowEditing ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => saveInlineEdit(row)} disabled={inlineSaving === row.id}>
                            {inlineSaving === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-emerald-600" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => cancelInlineEdit(row.id)}>
                            <X className="h-4 w-4 text-gray-500" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const hasEditable = columns.some((c) => c.editable);
                                if (hasEditable) { startInlineEdit(row); } else { setEditing(row); setOpen(true); }
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>共 {total} 筆</div>
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

      <FormDialog open={open} onClose={() => setOpen(false)} row={editing} onSaved={load} />
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
