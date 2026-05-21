"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { Loader2, Search, FileDown } from "lucide-react";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

type Module = {
  key: string;
  label: string;
  endpoint: string;
  columns: { key: string; title: string; render?: (r: any) => any }[];
};

const MODULES: Module[] = [
  {
    key: "products", label: "商品管理", endpoint: "/api/products",
    columns: [
      { key: "sku", title: "SKU" },
      { key: "name", title: "名稱" },
      { key: "spec", title: "規格" },
      { key: "costPrice", title: "成本", render: (r) => formatMoney(r.costPrice) },
      { key: "salePrice", title: "售價", render: (r) => formatMoney(r.salePrice) },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "customers", label: "客戶管理", endpoint: "/api/customers",
    columns: [
      { key: "code", title: "編號" },
      { key: "companyName", title: "公司名稱" },
      { key: "contactName", title: "聯絡人" },
      { key: "phone", title: "電話" },
      { key: "createdAt", title: "建立日期", render: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: "suppliers", label: "供應商管理", endpoint: "/api/suppliers",
    columns: [
      { key: "code", title: "編號" },
      { key: "companyName", title: "公司名稱" },
      { key: "contactName", title: "聯絡人" },
      { key: "phone", title: "電話" },
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

export function BomClient() {
  const [selectedModule, setSelectedModule] = useState<string>("products");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const currentModule = MODULES.find((m) => m.key === selectedModule)!;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`${currentModule.endpoint}?${params.toString()}`);
      const d = await res.json();
      setRows(d.items ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModule, page, q, fromDate, toDate]);

  useEffect(() => {
    setPage(1);
    setRows([]);
  }, [selectedModule]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function exportExcel() {
    const params = new URLSearchParams({ q, pageSize: "10000" });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`${currentModule.endpoint}?${params.toString()}`);
    const d = await res.json();
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel(
      `bom-${currentModule.key}`,
      currentModule.label,
      d.items ?? [],
      currentModule.columns.map((c) => ({
        key: c.key,
        title: c.title,
        get: c.render ? (r: any) => {
          const val = c.render!(r);
          return typeof val === "object" ? (r[c.key] ?? "") : val;
        } : undefined,
      }))
    );
  }

  return (
    <div className="space-y-4">
      {/* 模組選擇 */}
      <div className="flex flex-wrap gap-2">
        {MODULES.map((m) => (
          <button
            key={m.key}
            onClick={() => setSelectedModule(m.key)}
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
        <Button variant="outline" onClick={exportExcel}><FileDown className="h-4 w-4 mr-1" />匯出 Excel</Button>
        <span className="text-sm text-muted-foreground ml-auto">共 {total} 筆</span>
      </div>

      {/* 資料表格 */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                {currentModule.columns.map((col) => (
                  <TH key={col.key}>{col.title}</TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {rows.map((row, idx) => (
                <TR key={row.id ?? idx}>
                  {currentModule.columns.map((col) => (
                    <TD key={col.key}>
                      {col.render ? col.render(row) : (row[col.key] ?? "—")}
                    </TD>
                  ))}
                </TR>
              ))}
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
    </div>
  );
}
