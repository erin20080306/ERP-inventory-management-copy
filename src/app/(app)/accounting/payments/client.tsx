"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Loader2, Search, Download, Printer, FileDown } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { TableHint, useColumnDrag } from "@/components/table-helpers";

export function PaymentHistoryClient() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const pageSize = 20;
  const customCols = useCustomColumns("payments");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const colDrag = useColumnDrag("payments", ["type", "number", "party", "relNumber", "amount", "method", "date", "remark"]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ kind, q, page: String(page), pageSize: String(pageSize) });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`/api/accounting/payments?${params.toString()}`);
    const d = await res.json();
    setRows(d.items ?? []);
    setTotal(d.total ?? 0);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, kind, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const methodLabel = (m: string) => {
    if (m === "CASH") return "現金";
    if (m === "BANK") return "銀行轉帳";
    if (m === "CHEQUE") return "支票";
    return m;
  };

  const typeBadge = (type: string) => {
    if (type === "收款") return <Badge variant="success">{type}</Badge>;
    if (type === "付款") return <Badge variant="info">{type}</Badge>;
    return <Badge variant="warning">{type}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜尋客戶/供應商" className="pl-9 w-64" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }}>
            <option value="all">全部</option>
            <option value="ar">收款（銷售）</option>
            <option value="ap">付款（採購）</option>
          </select>
          <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
          <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={async () => {
            const res = await fetch(`/api/accounting/payments?kind=${kind}&q=${encodeURIComponent(q)}&pageSize=10000`);
            const d = await res.json();
            const { downloadExcel } = await import("@/lib/excel");
            downloadExcel("payments", "沖帳記錄", d.items, [
              { key: "type", title: "類型" },
              { key: "number", title: "單號" },
              { key: "party", title: "對象" },
              { key: "relNumber", title: "關聯單號" },
              { key: "amount", title: "金額", get: (r: any) => Number(r.amount) },
              { key: "method", title: "方式", get: (r: any) => methodLabel(r.method) },
              { key: "date", title: "日期", get: (r: any) => formatDate(r.date) },
              { key: "remark", title: "備註" },
            ]);
            toast.success("已匯出 Excel");
          }}>
            <FileDown className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" disabled={pdfBusy} onClick={async () => {
            setPdfBusy(true);
            try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF("沖帳記錄", "payments"); } finally { setPdfBusy(false); }
          }}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            列印
          </Button>
          <Button variant="outline" onClick={async () => {
            const res = await fetch(`/api/accounting/payments?kind=${kind}&q=${encodeURIComponent(q)}&pageSize=10000`);
            const d = await res.json();
            const csv = toCSV(d.items, [
              { key: "type", title: "類型" },
              { key: "number", title: "單號" },
              { key: "party", title: "對象" },
              { key: "relNumber", title: "關聯單號" },
              { key: "amount", title: "金額" },
              { key: "method", title: "方式", get: (r: any) => methodLabel(r.method) },
              { key: "date", title: "日期", get: (r: any) => formatDate(r.date) },
              { key: "remark", title: "備註" },
            ]);
            downloadCSV(`payments-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            toast.success("已匯出 CSV");
          }}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
        </div>
      </div>

      <TableHint />
      <Table>
        <THead>
          <TR>
            <TH {...colDrag.thProps("type")}>類型</TH>
            <TH {...colDrag.thProps("number")}>單號</TH>
            <TH {...colDrag.thProps("party")}>對象</TH>
            <TH {...colDrag.thProps("relNumber")}>關聯單號</TH>
            <TH {...colDrag.thProps("amount")}>金額</TH>
            <TH {...colDrag.thProps("method")}>方式</TH>
            <TH {...colDrag.thProps("date")}>日期</TH>
            <TH {...colDrag.thProps("remark")}>備註</TH>
            {customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}
          </TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={8} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
          {!loading && rows.length === 0 && <TR><TD colSpan={8}><EmptyState /></TD></TR>}
          {!loading && rows.map((r) => (
            <TR key={r.id}>
              <TD>{typeBadge(r.type)}</TD>
              <TD className="font-mono text-xs">{r.number}</TD>
              <TD>{r.party}</TD>
              <TD className="font-mono text-xs">{r.relNumber}</TD>
              <TD className="font-medium">{formatMoney(r.amount)}</TD>
              <TD>{methodLabel(r.method)}</TD>
              <TD>{formatDate(r.date)}</TD>
              <TD className="text-muted-foreground text-xs max-w-[150px] truncate">{r.remark ?? ""}</TD>
              {customCols.columns.map((cc) => {
                const cellKey = `${r.id}_${cc.id}`;
                const vals = getCustomFieldValues("payments", r.id);
                const isEditing = editingCells[cellKey];
                return (
                  <TD key={cc.id}>
                    {isEditing ? (
                      <Input
                        type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"}
                        defaultValue={vals[cc.id] ?? ""}
                        autoFocus
                        className="h-7 text-xs"
                        onBlur={(e) => {
                          setCustomFieldValue("payments", r.id, cc.id, e.target.value);
                          setEditingCells((p) => ({ ...p, [cellKey]: false }));
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 px-1 py-0.5 rounded min-h-[24px] inline-block min-w-[40px]"
                        onClick={() => setEditingCells((p) => ({ ...p, [cellKey]: true }))}
                      >
                        {vals[cc.id] || "—"}
                      </span>
                    )}
                  </TD>
                );
              })}
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>共 {total} 筆</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一頁</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一頁</Button>
        </div>
      </div>
      <CustomColumnDialog module="payments" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}
