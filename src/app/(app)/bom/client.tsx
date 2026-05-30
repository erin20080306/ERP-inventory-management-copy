"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { Loader2, Search, FileDown, Download, Printer, Upload, Pencil, Save, X } from "lucide-react";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { toast } from "sonner";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { readSessionCache, TableSkeletonRows, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";

type Module = {
  key: string;
  label: string;
  endpoint: string;
  columns: { key: string; title: string; render?: (r: any) => any; editable?: boolean }[];
};

const MODULES: Module[] = [
  {
    key: "products", label: "商品管理", endpoint: "/api/products",
    columns: [
      { key: "sku", title: "SKU", editable: true },
      { key: "name", title: "名稱", editable: true },
      { key: "spec", title: "規格", editable: true },
      { key: "costPrice", title: "成本", render: (r) => formatMoney(r.costPrice), editable: true },
      { key: "salePrice", title: "售價", render: (r) => formatMoney(r.salePrice), editable: true },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "customers", label: "客戶管理", endpoint: "/api/customers",
    columns: [
      { key: "code", title: "編號", editable: true },
      { key: "companyName", title: "公司名稱", editable: true },
      { key: "contactName", title: "聯絡人", editable: true },
      { key: "phone", title: "電話", editable: true },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "suppliers", label: "供應商管理", endpoint: "/api/suppliers",
    columns: [
      { key: "code", title: "編號", editable: true },
      { key: "companyName", title: "公司名稱", editable: true },
      { key: "contactName", title: "聯絡人", editable: true },
      { key: "phone", title: "電話", editable: true },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "purchases", label: "採購管理", endpoint: "/api/purchases",
    columns: [
      { key: "number", title: "單號" },
      { key: "supplier", title: "供應商", render: (r) => r.supplier?.companyName ?? "—" },
      { key: "total", title: "總計", render: (r) => formatMoney(r.total) },
      { key: "status", title: "狀態" },
      { key: "createdAt", title: "日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "sales", label: "銷售管理", endpoint: "/api/sales",
    columns: [
      { key: "number", title: "單號" },
      { key: "customer", title: "客戶", render: (r) => r.customer?.companyName ?? "—" },
      { key: "total", title: "總計", render: (r) => formatMoney(r.total) },
      { key: "status", title: "狀態" },
      { key: "createdAt", title: "日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "quotations", label: "報價單", endpoint: "/api/quotations",
    columns: [
      { key: "number", title: "單號" },
      { key: "customer", title: "客戶", render: (r) => r.customer?.companyName ?? "—" },
      { key: "total", title: "總計", render: (r) => formatMoney(r.total) },
      { key: "status", title: "狀態" },
      { key: "quoteDate", title: "報價日期", render: (r) => formatDate(r.quoteDate) },
    ],
  },
  {
    key: "accounts", label: "會計科目", endpoint: "/api/accounting/accounts",
    columns: [
      { key: "code", title: "科目編號" },
      { key: "name", title: "科目名稱" },
      { key: "type", title: "類型" },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "journals", label: "傳票管理", endpoint: "/api/accounting/journals",
    columns: [
      { key: "number", title: "傳票號" },
      { key: "summary", title: "摘要" },
      { key: "entryDate", title: "日期", render: (r) => formatDate(r.entryDate) },
      { key: "status", title: "狀態" },
    ],
  },
  {
    key: "receivables", label: "應收帳款", endpoint: "/api/accounting/receivables",
    columns: [
      { key: "customer", title: "客戶", render: (r) => r.customer?.companyName ?? "—" },
      { key: "amount", title: "金額", render: (r) => formatMoney(r.amount) },
      { key: "paidAmount", title: "已收", render: (r) => formatMoney(r.paidAmount) },
      { key: "status", title: "狀態" },
      { key: "createdAt", title: "日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "payables", label: "應付帳款", endpoint: "/api/accounting/payables",
    columns: [
      { key: "supplier", title: "供應商", render: (r) => r.supplier?.companyName ?? "—" },
      { key: "amount", title: "金額", render: (r) => formatMoney(r.amount) },
      { key: "paidAmount", title: "已付", render: (r) => formatMoney(r.paidAmount) },
      { key: "status", title: "狀態" },
      { key: "createdAt", title: "日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "notes-receivable", label: "應收票據", endpoint: "/api/accounting/notes-receivable",
    columns: [
      { key: "noteNumber", title: "票號" },
      { key: "customer", title: "客戶", render: (r) => r.customer?.companyName ?? "—" },
      { key: "amount", title: "金額", render: (r) => formatMoney(r.amount) },
      { key: "dueDate", title: "到期日", render: (r) => formatDate(r.dueDate) },
      { key: "status", title: "狀態" },
    ],
  },
  {
    key: "notes-payable", label: "應付票據", endpoint: "/api/accounting/notes-payable",
    columns: [
      { key: "noteNumber", title: "票號" },
      { key: "supplier", title: "供應商", render: (r) => r.supplier?.companyName ?? "—" },
      { key: "amount", title: "金額", render: (r) => formatMoney(r.amount) },
      { key: "dueDate", title: "到期日", render: (r) => formatDate(r.dueDate) },
      { key: "status", title: "狀態" },
    ],
  },
  {
    key: "invoices", label: "發票管理", endpoint: "/api/accounting/invoices",
    columns: [
      { key: "number", title: "發票號碼" },
      { key: "type", title: "類型" },
      { key: "totalAmount", title: "含稅金額", render: (r) => formatMoney(r.totalAmount) },
      { key: "status", title: "狀態" },
      { key: "invoiceDate", title: "日期", render: (r) => formatDate(r.invoiceDate) },
    ],
  },
  {
    key: "fixed-assets", label: "固定資產", endpoint: "/api/accounting/fixed-assets",
    columns: [
      { key: "code", title: "編號" },
      { key: "name", title: "名稱" },
      { key: "cost", title: "原值", render: (r) => formatMoney(r.cost) },
      { key: "status", title: "狀態" },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "employees", label: "員工管理", endpoint: "/api/hr/employees",
    columns: [
      { key: "employeeNo", title: "員工編號" },
      { key: "name", title: "姓名" },
      { key: "department", title: "部門", render: (r) => r.department?.name ?? "—" },
      { key: "status", title: "狀態" },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "departments", label: "部門管理", endpoint: "/api/hr/departments",
    columns: [
      { key: "code", title: "編號" },
      { key: "name", title: "名稱" },
      { key: "isActive", title: "狀態", render: (r) => r.isActive ? "啟用" : "停用" },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
];

const BOM_OVERVIEW_ENDPOINT = "/api/bom/overview";

export function BomClient() {
  const [selectedModule, setSelectedModule] = useState<string>("products");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const customCols = useCustomColumns(`bom-${selectedModule}`);
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const [inlineRow, setInlineRow] = useState<Record<string, any>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  const requestSeq = useRef(0);

  async function saveInlineRow(row: any) {
    const draft = inlineRow[row.id]; if (!draft) return;
    setInlineSaving(row.id);
    try {
      const res = await fetch(`${currentModule.endpoint}/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...row, ...draft }) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存"); setInlineRow((p) => { const n = { ...p }; delete n[row.id]; return n; }); load();
    } catch (e: any) { toast.error(e.message); } finally { setInlineSaving(null); }
  }

  const currentModule = MODULES.find((m) => m.key === selectedModule)!;
  const queryString = useMemo(() => {
    const params = new URLSearchParams({ q: debouncedQ, page: String(page), pageSize: String(pageSize) });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params.toString();
  }, [debouncedQ, fromDate, page, toDate]);
  const activeDataKey = `${selectedModule}:${queryString}`;
  const hasCurrentData = loadedKey === activeDataKey;
  const displayRows = hasCurrentData ? rows : [];
  const displayTotal = hasCurrentData ? total : 0;
  const waitingForData = (loading || !hasCurrentData) && displayRows.length === 0;

  async function load() {
    const seq = ++requestSeq.current;
    const cacheKey = `bom:${activeDataKey}`;
    const cached = readSessionCache<{ items: any[]; total: number }>(cacheKey);
    if (cached) {
      setRows(cached.items ?? []);
      setTotal(cached.total ?? 0);
      setLoadedKey(activeDataKey);
      setLoading(false);
    } else {
      setRows([]);
      setTotal(0);
      setLoadedKey("");
      setLoading(true);
    }
    try {
      const params = new URLSearchParams(queryString);
      params.set("module", selectedModule);
      const res = await fetch(`${BOM_OVERVIEW_ENDPOINT}?${params.toString()}`);
      const d = await res.json();
      const next = { items: d.items ?? [], total: d.total ?? 0 };
      if (seq !== requestSeq.current) return;
      setRows(next.items);
      setTotal(next.total);
      setLoadedKey(activeDataKey);
      writeSessionCache(cacheKey, next);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataKey]);

  const totalPages = Math.max(1, Math.ceil(displayTotal / pageSize));
  const tableColumnCount = currentModule.columns.length + customCols.columns.length + 1;

  function selectModule(key: string) {
    if (key === selectedModule) return;
    setLoading(true);
    setPage(1);
    setSelectedModule(key);
  }

  async function fetchAll() {
    const params = new URLSearchParams({ q, pageSize: "10000" });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`${currentModule.endpoint}?${params.toString()}`);
    const d = await res.json();
    return d.items ?? [];
  }

  function getExportColumns() {
    return currentModule.columns.map((c) => ({
      key: c.key,
      title: c.title,
      get: c.render ? (r: any) => {
        const val = c.render!(r);
        return typeof val === "object" ? (r[c.key] ?? "") : val;
      } : undefined,
    }));
  }

  async function exportExcel() {
    const items = await fetchAll();
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel(`bom-${currentModule.key}`, currentModule.label, items, getExportColumns());
    toast.success("已匯出 Excel");
  }

  async function exportCSV() {
    const items = await fetchAll();
    const csv = toCSV(items, getExportColumns());
    downloadCSV(`bom-${currentModule.key}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success("已匯出 CSV");
  }

  async function exportPDF() {
    const { exportPageToPDF } = await import("@/lib/export-pdf");
    await exportPageToPDF(`BOM-${currentModule.label}`, `bom-${currentModule.key}`);
    toast.success("已匯出 PDF");
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let data: any[] = [];
      if (ext === "csv") {
        const text = await file.text();
        const lines = text.split("\n").filter(Boolean);
        if (lines.length < 2) throw new Error("檔案為空");
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          const row: any = {};
          headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
          data.push(row);
        }
      } else {
        const { readExcelFile } = await import("@/lib/excel");
        data = await readExcelFile(file);
      }
      toast.success(`已讀取 ${data.length} 筆資料（僅預覽，實際匯入請在各模組操作）`);
      console.table(data.slice(0, 5));
    } catch (err: any) {
      toast.error(err.message || "匯入失敗");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {/* 模組選擇 */}
      <div className="flex flex-wrap gap-2">
        {MODULES.map((m) => (
          <button
            key={m.key}
            onClick={() => selectModule(m.key)}
            className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
              selectedModule === m.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-input hover:bg-muted"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 篩選列 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋..." className="pl-9 w-64" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" />CSV</Button>
        <Button variant="outline" onClick={exportExcel}><FileDown className="h-4 w-4 mr-1" />Excel</Button>
        <Button variant="outline" onClick={exportPDF}><Printer className="h-4 w-4 mr-1" />PDF</Button>
        <Button variant="outline" onClick={() => document.getElementById("bom-import")?.click()}><Upload className="h-4 w-4 mr-1" />匯入</Button>
        <input id="bom-import" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} />
        <CustomColumnButton onClick={() => customCols.setOpen(true)} />
        <span className="text-sm text-muted-foreground ml-auto">{waitingForData ? "載入中..." : `共 ${displayTotal} 筆`}</span>
      </div>

      {/* 資料表格 */}
      {!loading && hasCurrentData && displayRows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                {currentModule.columns.map((col) => (
                  <TH key={col.key}>{col.title}</TH>
                ))}
                {customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}
                <TH className="w-20 text-right">操作</TH>
              </TR>
            </THead>
            <TBody>
              {waitingForData && <TableSkeletonRows columns={tableColumnCount} />}
              {displayRows.map((row, idx) => {
                const isEditing = !!inlineRow[row.id];
                return (
                <TR key={row.id ?? idx} className={isEditing ? "bg-accent/5" : ""}>
                  {currentModule.columns.map((col) => (
                    <TD key={col.key}>
                      {isEditing && col.editable ? (
                        <Input value={inlineRow[row.id]?.[col.key] ?? ""} onChange={(e) => setInlineRow((p) => ({ ...p, [row.id]: { ...p[row.id], [col.key]: e.target.value } }))} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Enter") saveInlineRow(row); if (e.key === "Escape") setInlineRow((p) => { const n = { ...p }; delete n[row.id]; return n; }); }} />
                      ) : (
                        col.render ? col.render(row) : (row[col.key] ?? "—")
                      )}
                    </TD>
                  ))}
                  {customCols.columns.map((cc) => { const ck = `${row.id}_${cc.id}`; const v = getCustomFieldValues(`bom-${selectedModule}`, row.id); const isE = editingCells[ck]; return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : "text"} defaultValue={v[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue(`bom-${selectedModule}`, row.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [ck]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="inline-block min-h-[24px] min-w-[40px] cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted" onClick={() => setEditingCells((p) => ({ ...p, [ck]: true }))}>{v[cc.id] || "—"}</span>}</TD>; })}
                  <TD className="text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => saveInlineRow(row)} disabled={inlineSaving === row.id}>{inlineSaving === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-emerald-600" />}</Button>
                        <Button variant="ghost" size="icon" onClick={() => setInlineRow((p) => { const n = { ...p }; delete n[row.id]; return n; })}><X className="h-4 w-4 text-gray-500" /></Button>
                      </div>
                    ) : (
                      row.id && currentModule.columns.some((c) => c.editable) ? (
                        <Button variant="ghost" size="icon" onClick={() => { const draft: any = {}; currentModule.columns.forEach((c) => { if (c.editable) draft[c.key] = row[c.key] ?? ""; }); setInlineRow((p) => ({ ...p, [row.id]: draft })); }}><Pencil className="h-4 w-4" /></Button>
                      ) : null
                    )}
                  </TD>
                </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一頁</Button>
          <span className="text-sm">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一頁</Button>
        </div>
      )}
      <CustomColumnDialog module={`bom-${selectedModule}`} columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}
