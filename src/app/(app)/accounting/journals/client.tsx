"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Search, Eye, Download, Printer, FileDown, Pencil, LockKeyhole, RotateCcw } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { useCustomColumns, useCustomFieldValues, CustomColumnDialog, CustomColumnButton, CustomFieldGridCell } from "@/components/custom-columns";
import { readSessionCache, TableHint, TableSkeletonRows, useColumnDrag, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/i18n/use-formatters";

function currentMonthEnd() {
  const m = useTranslations("journals");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const { dateTime } = useFormatters();
  const tPage = useTranslations("pages");
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("sv-SE");
}

export function JournalClient() {
  const m = useTranslations("journals");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const { dateTime } = useFormatters();
  const tPage = useTranslations("pages");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [view, setView] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [prefillDraft, setPrefillDraft] = useState<any>(null);
  const customCols = useCustomColumns("journals");
  const customFieldValues = useCustomFieldValues("journals", rows.map((row) => row.id));
  const colDrag = useColumnDrag("journals", ["number", "date", "summary", "debit", "credit", "status", "updatedBy"]);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodEnd, setPeriodEnd] = useState(currentMonthEnd);
  const [isYearEnd, setIsYearEnd] = useState(false);
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodBusy, setPeriodBusy] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<any>(null);
  const [reopenReason, setReopenReason] = useState("");

  // 讀取從進銷存頁面轉傳票傳入的草稿
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("fromSource") === "1") {
      const raw = sessionStorage.getItem("journal_draft");
      if (raw) {
        try {
          setPrefillDraft(JSON.parse(raw));
          setOpenNew(true);
          sessionStorage.removeItem("journal_draft");
          // 清掉 URL 參數
          window.history.replaceState({}, "", "/accounting/journals");
        } catch { toast.error(m("draftLoadFailed")); }
      }
    }
  }, []);
  const pageSize = 20;

  async function load() {
    const params = new URLSearchParams({ q: debouncedQ, page: String(page), pageSize: String(pageSize) });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const cacheKey = `journals:${params.toString()}`;
    const cached = readSessionCache<{ items: any[]; total: number }>(cacheKey);
    if (cached) {
      setRows(cached.items ?? []);
      setTotal(cached.total ?? 0);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/accounting/journals?${params}`);
      const d = await res.json();
      const next = { items: d.items ?? [], total: d.total ?? 0 };
      setRows(next.items);
      setTotal(next.total);
      writeSessionCache(cacheKey, next);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQ, fromDate, toDate]);

  const editableFields = ["date", "summary"];

  function startCellEdit(row: any, colKey: string) {
    if (!["DRAFT", "REJECTED"].includes(row.status)) return;
    if (!inlineEditing[row.id]) {
      const draft: Record<string, any> = {};
      editableFields.forEach((f) => {
        draft[f] = f === "date" ? row.entryDate?.slice(0, 10) ?? "" : (row as any)[f] ?? "";
      });
      setInlineEditing((prev) => ({ ...prev, [row.id]: draft }));
    }
    setActiveCell({ rowId: row.id, colKey });
  }

  function handleCellKeyDown(e: React.KeyboardEvent, row: any, colKey: string) {
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

  async function saveCellAndMove(currentRow: any, targetRowIdx: number, targetColKey: string) {
    await saveInlineEdit(currentRow);
    if (targetRowIdx >= 0 && targetRowIdx < rows.length) {
      const targetRow = rows[targetRowIdx];
      startCellEdit(targetRow, targetColKey);
    } else {
      setActiveCell(null);
    }
  }

  async function saveInlineEdit(row: any) {
    const draft = inlineEditing[row.id];
    if (!draft) return;
    try {
      const payload = { summary: draft.summary ?? row.summary, entryDate: draft.date ?? row.entryDate, lines: row.lines };
      const res = await fetch(`/api/accounting/journals/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      const saved = await res.json().catch(() => null);
      toast.success(tc("saved"));
      setInlineEditing((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      setRows((prev) => prev.map((r) => r.id === row.id ? (saved && saved.id ? saved : { ...r, ...draft }) : r));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function cancelInlineEdit(rowId: string) {
    setInlineEditing((prev) => { const n = { ...prev }; delete n[rowId]; return n; });
    if (activeCell?.rowId === rowId) setActiveCell(null);
  }

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      const res = await fetch(`/api/accounting/journals/${id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || f("actionFailed"));
      toast.success(data.message || f("settled"));
      load();
      setView(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function loadPeriods() {
    const res = await fetch("/api/accounting/closing");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || m("closeDataLoadFailed"));
    setPeriods(data.items ?? []);
  }

  async function openPeriodManager() {
    setPeriodOpen(true);
    try { await loadPeriods(); } catch (error: any) { toast.error(error.message); }
  }

  async function closePeriod() {
    if (!periodEnd) return toast.error(m("monthEndRequired"));
    setPeriodBusy(true);
    try {
      const res = await fetch("/api/accounting/closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CLOSE", periodEnd, isYearEnd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || m("closeFailed"));
      toast.success(data.closingJournal ? m("closeDoneWithEntry", { number: data.closingJournal.number }) : m("closeNoActivity"));
      await Promise.all([load(), loadPeriods()]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setPeriodBusy(false);
    }
  }

  async function reopenPeriod() {
    if (!reopenTarget || reopenReason.trim().length < 2) return toast.error(m("reopenReasonRequired"));
    setPeriodBusy(true);
    try {
      const res = await fetch("/api/accounting/closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REOPEN", periodEnd: reopenTarget.endDate.slice(0, 10), reason: reopenReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || m("reopenFailed"));
      toast.success(data.reversalJournal ? m("reopenedWithEntry", { number: data.reversalJournal.number }) : m("periodReopened"));
      setReopenTarget(null);
      setReopenReason("");
      await Promise.all([load(), loadPeriods()]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setPeriodBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder={m("searchPlaceholder")} className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
          <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const res = await fetch(`/api/accounting/journals?q=${encodeURIComponent(q)}&pageSize=10000`);
              const d = await res.json();
              const flat: any[] = [];
              d.items.forEach((j: any) => {
                j.lines.forEach((l: any) => {
                  flat.push({
                    number: j.number, date: formatDate(j.entryDate), summary: j.summary, status: j.status,
                    account: `${l.account.code} ${l.account.name}`, debit: l.debit, credit: l.credit, memo: l.memo ?? "",
                  });
                });
              });
              const csv = toCSV(flat, [
                { key: "number", title: m("number") },
                { key: "date", title: tc("date") },
                { key: "summary", title: f("summary") },
                { key: "account", title: f("account") },
                { key: "debit", title: f("debit") },
                { key: "credit", title: f("credit") },
                { key: "memo", title: m("lineSummary") },
                { key: "status", title: tc("status") },
              ]);
              downloadCSV(`journals-${new Date().toISOString().slice(0, 10)}.csv`, csv);
              toast.success(tt("exportedCsv"));
            }}
          ><Download className="h-4 w-4" />CSV</Button>
          <Button variant="outline" onClick={async () => {
            const res = await fetch(`/api/accounting/journals?q=${encodeURIComponent(q)}&pageSize=10000`);
            const d = await res.json();
            const flat: any[] = [];
            d.items.forEach((j: any) => j.lines.forEach((l: any) => flat.push({
              number: j.number, date: formatDate(j.entryDate), summary: j.summary, status: j.status,
              account: `${l.account.code} ${l.account.name}`, debit: Number(l.debit), credit: Number(l.credit), memo: l.memo ?? "",
            })));
            const { downloadExcel } = await import("@/lib/excel");
            downloadExcel("journals", tPage("accountingJournals.title"), flat, [
              { key: "number", title: m("number") },
              { key: "date", title: tc("date") },
              { key: "summary", title: f("summary") },
              { key: "account", title: f("account") },
              { key: "debit", title: f("debit") },
              { key: "credit", title: f("credit") },
              { key: "memo", title: m("lineSummary") },
              { key: "status", title: tc("status") },
            ]);
            toast.success(tt("exportedExcel"));
          }}><FileDown className="h-4 w-4" />Excel</Button>
          <Button variant="outline" disabled={pdfBusy} onClick={async () => {
            setPdfBusy(true);
            try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF(tPage("accountingJournals.title"), "journals"); } finally { setPdfBusy(false); }
          }}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <Button variant="outline" onClick={openPeriodManager}><LockKeyhole className="h-4 w-4" />{m("periodClosed")}</Button>
          <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" />{m("create")}</Button>
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
        </div>
      </div>

      <TableHint />
      <Table>
        <THead onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("manageCustomColumns")}>
          <TR>
            <TH {...colDrag.thProps("number")}>{f("code")}</TH><TH {...colDrag.thProps("date")}>{tc("date")}</TH><TH {...colDrag.thProps("summary")}>{f("summary")}</TH><TH {...colDrag.thProps("debit")}>{f("debit")}</TH><TH {...colDrag.thProps("credit")}>{f("credit")}</TH><TH {...colDrag.thProps("status")}>{tc("status")}</TH><TH {...colDrag.thProps("updatedBy")}>{f("updatedBy")}</TH>{customCols.columns.map((cc) => <TH key={cc.id} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("rightClickColumns")}>{cc.label}</TH>)}<TH className="w-20 text-right">{tc("actions")}</TH>
          </TR>
        </THead>
        <TBody>
          {loading && rows.length === 0 && <TableSkeletonRows columns={8 + customCols.columns.length} />}
          {!loading && rows.length === 0 && <TR><TD colSpan={8 + customCols.columns.length}><EmptyState /></TD></TR>}
          {rows.length > 0 && rows.map((r, rowIndex) => {
            const debit = r.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
            const credit = r.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
            const draft = inlineEditing[r.id];
            const isRowEditing = !!draft;
            return (
              <TR key={r.id} className={isRowEditing ? "bg-accent/5" : ""}>
                <TD className="font-mono text-xs">{r.number}</TD>
                <TD
                  className={editableFields.includes("date") && ["DRAFT", "REJECTED"].includes(r.status) ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                  onClick={() => { if (editableFields.includes("date") && ["DRAFT", "REJECTED"].includes(r.status)) startCellEdit(r, "date"); }}
                >
                  {activeCell?.rowId === r.id && activeCell?.colKey === "date" ? (
                    <Input
                      type="date"
                      value={draft?.date ?? r.entryDate?.slice(0, 10) ?? ""}
                      autoFocus
                      onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], date: e.target.value } }))}
                      className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                      onKeyDown={(e) => handleCellKeyDown(e, r, "date")}
                      ref={(el) => { if (el) el.focus(); }}
                    />
                  ) : (
                    formatDate(r.entryDate)
                  )}
                </TD>
                <TD
                  className={editableFields.includes("summary") && ["DRAFT", "REJECTED"].includes(r.status) ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                  onClick={() => { if (editableFields.includes("summary") && ["DRAFT", "REJECTED"].includes(r.status)) startCellEdit(r, "summary"); }}
                >
                  {activeCell?.rowId === r.id && activeCell?.colKey === "summary" ? (
                    <Input
                      value={draft?.summary ?? r.summary ?? ""}
                      autoFocus
                      onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], summary: e.target.value } }))}
                      className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                      onKeyDown={(e) => handleCellKeyDown(e, r, "summary")}
                      ref={(el) => { if (el) el.focus(); }}
                    />
                  ) : (
                    r.summary
                  )}
                </TD>
                <TD>{formatMoney(debit)}</TD>
                <TD>{formatMoney(credit)}</TD>
                <TD><div className="flex items-center gap-1"><StatusBadge status={r.status} />{r.reversal && <span className="text-xs text-amber-700">{m("reversed")}</span>}{r.reversalOf && <span className="text-xs text-blue-700">{m("reversalEntry")}</span>}</div></TD>
                <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
                {customCols.columns.map((cc, columnIndex) => { const v = customFieldValues.getValues(r.id); return <TD key={cc.id}><CustomFieldGridCell gridId="journals" rowId={r.id} rowIndex={rowIndex} column={cc} columnIndex={columnIndex} rowIds={rows.map((row) => row.id)} columns={customCols.columns} value={v[cc.id] ?? ""} saveValues={customFieldValues.saveValues} onManageColumns={() => customCols.setOpen(true)} /></TD>; })}
                <TD className="text-right flex items-center justify-end gap-0">
                  <Button variant="ghost" size="icon" onClick={() => setView(r)} title={m("view")}><Eye className="h-4 w-4" /></Button>
                  {["DRAFT", "REJECTED"].includes(r.status) && <Button variant="ghost" size="icon" onClick={() => setEditId(r.id)} title={tc("edit")}><Pencil className="h-4 w-4" /></Button>}
                  {["DRAFT", "REJECTED"].includes(r.status) && <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title={tc("delete")} onClick={() => { if (confirm(m("confirmDeleteDraft", { number: r.number }))) act(r.id, "delete"); }}><Trash2 className="h-4 w-4" /></Button>}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>{tt("totalRows", { total })}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{tt("prevPage")}</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{tt("nextPage")}</Button>
        </div>
      </div>
      <CreateJournalDialog open={openNew} onClose={() => { setOpenNew(false); setPrefillDraft(null); }} onCreated={(newJournal) => { setOpenNew(false); setPrefillDraft(null); if (newJournal) { setRows((prev) => [newJournal, ...prev]); setTotal((prev) => prev + 1); } else { load(); } }} prefillDraft={prefillDraft} />
      {view && <ViewJournalDialog entry={view} onClose={() => setView(null)} onAct={act} onEdit={(id: string) => { setView(null); setEditId(id); }} />}
      {editId && <EditJournalDialog id={editId} onClose={() => setEditId(null)} onSaved={(updated) => { setEditId(null); if (updated) { setRows((prev) => prev.map((r) => r.id === updated.id ? updated : r)); } else { load(); } }} />}
      <Dialog open={periodOpen} onOpenChange={(open) => { if (!open) { setPeriodOpen(false); setReopenTarget(null); setReopenReason(""); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{m("periodClose")}</DialogTitle></DialogHeader>
          <div className="rounded-md border bg-amber-50 p-3 text-sm text-amber-900">
            {m("closeWarning")}
          </div>
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <div className="space-y-1"><Label>{m("monthEnd")}</Label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></div>
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={isYearEnd} onChange={(event) => setIsYearEnd(event.target.checked)} />
              {m("yearCloseNote")}
            </label>
            <Button onClick={closePeriod} disabled={periodBusy}>{periodBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}{m("runClose")}</Button>
          </div>

          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">{m("period")}</th><th className="p-2 text-left">{f("type")}</th><th className="p-2 text-left">{tc("status")}</th><th className="p-2 text-left">{m("carryForward")}</th><th className="p-2 text-right">{tc("actions")}</th></tr></thead>
              <tbody>
                {periods.length === 0 && <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>{m("noCloseRecords")}</td></tr>}
                {periods.map((record) => (
                  <tr key={record.id} className="border-t">
                    <td className="p-2">{m("periodLabel", { year: record.year, month: record.month })}</td>
                    <td className="p-2">{record.closeType === "YEAR_END" ? m("yearClose") : m("monthClose")}</td>
                    <td className="p-2">{record.status === "CLOSED" ? <span className="text-red-700">{m("closed")}</span> : <span className="text-emerald-700">{m("reopened")}</span>}</td>
                    <td className="p-2 font-mono text-xs">{record.closingJournal?.number ?? m("noCarryForward")}{record.closingJournal?.reversal ? m("reversedBy", { number: record.closingJournal.reversal.number }) : ""}</td>
                    <td className="p-2 text-right">{record.status === "CLOSED" && <Button size="sm" variant="outline" onClick={() => { setReopenTarget(record); setReopenReason(""); }}><RotateCcw className="h-4 w-4" />{m("reopen")}</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reopenTarget && <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
            <Label>{m("reopenReasonLabel", { year: reopenTarget.year, month: reopenTarget.month })}</Label>
            <Textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder={m("reverseReasonExample")} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setReopenTarget(null); setReopenReason(""); }}>{tc("cancel")}</Button>
              <Button variant="destructive" onClick={reopenPeriod} disabled={periodBusy || reopenReason.trim().length < 2}>{periodBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{m("confirmReopen")}</Button>
            </div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setPeriodOpen(false)}>{tc("close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <CustomColumnDialog module="journals" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}

function CreateJournalDialog({ open, onClose, onCreated, prefillDraft }: { open: boolean; onClose: () => void; onCreated: (newJournal: any | null) => void; prefillDraft: any }) {
  const m = useTranslations("journals");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const { dateTime } = useFormatters();
  const tPage = useTranslations("pages");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [summary, setSummary] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<any[]>([{ accountId: "", debit: 0, credit: 0, memo: "" }, { accountId: "", debit: 0, credit: 0, memo: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/accounting/accounts").then((r) => r.json()).then((d) => setAccounts(d.items ?? []));
    if (prefillDraft) {
      setSummary(prefillDraft.summary || "");
      setEntryDate(prefillDraft.entryDate || new Date().toISOString().slice(0, 10));
      setLines(prefillDraft.lines.map((l: any) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo ?? "" })));
    } else {
      setSummary(""); setEntryDate(new Date().toISOString().slice(0, 10));
      setLines([{ accountId: "", debit: 0, credit: 0, memo: "" }, { accountId: "", debit: 0, credit: 0, memo: "" }]);
    }
  }, [open, prefillDraft]);

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  function update(idx: number, patch: any) { const n = [...lines]; n[idx] = { ...n[idx], ...patch }; setLines(n); }
  function add() { setLines([...lines, { accountId: "", debit: 0, credit: 0, memo: "" }]); }
  function remove(idx: number) { setLines(lines.filter((_, i) => i !== idx)); }

  async function save() {
    if (!balanced) return toast.error(m("mustBalance"));
    if (lines.some((l) => !l.accountId)) return toast.error(m("accountRequired"));
    setSaving(true);
    try {
      const res = await fetch("/api/accounting/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, entryDate, lines }),
      });
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      const data = await res.json();
      toast.success(m("created"));
      onCreated(data);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{m("create")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>{m("entryDate")}</Label><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
          <div className="space-y-1 col-span-2"><Label>{f("summary")}</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={m("summaryExample")} /></div>
        </div>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">{f("account")}</th><th className="p-2 w-32">{f("debit")}</th><th className="p-2 w-32">{f("credit")}</th><th className="p-2 text-left">{f("summary")}</th><th className="p-2 w-10"></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={l.accountId} onChange={(e) => update(i, { accountId: e.target.value })}>
                      <option value="">{m("selectAccount")}</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><Input inputMode="numeric" className="[appearance:textfield]" placeholder="0" value={l.debit || ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); update(i, { debit: v, credit: 0 }); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const next = document.querySelector<HTMLElement>(`[data-jr="${i + 1}-d"]`); if (next) next.focus(); else add(); setTimeout(() => document.querySelector<HTMLElement>(`[data-jr="${i + 1}-d"]`)?.focus(), 50); }}} data-jr={`${i}-d`} /></td>
                  <td className="p-2"><Input inputMode="numeric" className="[appearance:textfield]" placeholder="0" value={l.credit || ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); update(i, { credit: v, debit: 0 }); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const next = document.querySelector<HTMLElement>(`[data-jr="${i + 1}-c"]`); if (next) next.focus(); else add(); setTimeout(() => document.querySelector<HTMLElement>(`[data-jr="${i + 1}-c"]`)?.focus(), 50); }}} data-jr={`${i}-c`} /></td>
                  <td className="p-2"><Input value={l.memo ?? ""} onChange={(e) => update(i, { memo: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const next = document.querySelector<HTMLElement>(`[data-jr="${i + 1}-d"]`); if (next) next.focus(); else add(); setTimeout(() => document.querySelector<HTMLElement>(`[data-jr="${i + 1}-d"]`)?.focus(), 50); }}} /></td>
                  <td className="p-2"><Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2"><Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" />{m("addLine")}</Button></div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-muted-foreground">{m("debitTotal")}</div><div className="font-medium">{formatMoney(totalDebit)}</div></div>
          <div><div className="text-muted-foreground">{m("creditTotal")}</div><div className="font-medium">{formatMoney(totalCredit)}</div></div>
          <div><div className="text-muted-foreground">{tc("status")}</div><div className={balanced ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>{balanced ? m("balanced") : m("unbalanced")}</div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{tc("cancel")}</Button><Button onClick={save} disabled={!balanced || saving}>{saving ? tc("saving") : tc("save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewJournalDialog({ entry, onClose, onAct, onEdit }: any) {
  const m = useTranslations("journals");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const { dateTime } = useFormatters();
  const tPage = useTranslations("pages");
  const totalDebit = entry.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
  const totalCredit = entry.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
  const [showReverse, setShowReverse] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const [reversalDate, setReversalDate] = useState(new Date().toLocaleDateString("sv-SE"));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{m("entryTitle", { number: entry.number })} <StatusBadge status={entry.status} />{entry.reversal && <span className="ml-2 text-sm font-normal text-amber-700">{m("reversedByEntry", { number: entry.reversal.number })}</span>}{entry.reversalOf && <span className="ml-2 text-sm font-normal text-blue-700">沖銷 {entry.reversalOf.number}</span>}</DialogTitle></DialogHeader>
        <div className="text-sm">{m("dateSummary", { date: formatDate(entry.entryDate), summary: entry.summary || "—" })}</div>
        <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground sm:grid-cols-4">
          <div>{m("preparedBy", { name: entry.createdBy?.name || entry.createdBy?.username || entry.updatedBy || "—" })}</div>
          <div>{m("submittedAt", { time: entry.submittedAt ? dateTime(entry.submittedAt) : "—" })}</div>
          <div>{m("approvedAt", { time: entry.approvedAt ? dateTime(entry.approvedAt) : "—" })}</div>
          <div>{m("postedAt", { time: entry.postedAt ? dateTime(entry.postedAt) : "—" })}</div>
        </div>
        <table className="w-full text-sm border rounded-md">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">{f("account")}</th><th className="p-2 text-right">{f("debit")}</th><th className="p-2 text-right">{f("credit")}</th><th className="p-2 text-left">{f("summary")}</th></tr></thead>
          <tbody>
            {entry.lines.map((l: any) => (
              <tr key={l.id} className="border-t"><td className="p-2">{l.account.code} {l.account.name}</td><td className="p-2 text-right">{Number(l.debit) > 0 ? formatMoney(l.debit) : "—"}</td><td className="p-2 text-right">{Number(l.credit) > 0 ? formatMoney(l.credit) : "—"}</td><td className="p-2">{l.memo ?? "—"}</td></tr>
            ))}
            <tr className="border-t font-medium bg-muted/30"><td className="p-2">{tc("total")}</td><td className="p-2 text-right">{formatMoney(totalDebit)}</td><td className="p-2 text-right">{formatMoney(totalCredit)}</td><td></td></tr>
          </tbody>
        </table>
        {showReverse && <div className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-[160px_1fr]">
          <div className="space-y-1"><Label>{m("reverseDate")}</Label><Input type="date" value={reversalDate} onChange={(event) => setReversalDate(event.target.value)} /></div>
          <div className="space-y-1"><Label>{m("reverseReason")}</Label><Textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} placeholder={m("reverseReasonPlaceholder")} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => setShowReverse(false)}>{tc("cancel")}</Button>
            <Button variant="destructive" disabled={reverseReason.trim().length < 2 || !reversalDate} onClick={() => onAct(entry.id, "reverse", { reason: reverseReason, reversalDate })}>{m("createReversal")}</Button>
          </div>
        </div>}
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => window.open(`/print/journal/${entry.id}`, "_blank")}>
            <Printer className="h-4 w-4" />{tc("print")}
          </Button>
          {["DRAFT", "REJECTED"].includes(entry.status) && <Button variant="outline" onClick={() => onEdit(entry.id)}><Pencil className="h-4 w-4" />{m("editTitle")}</Button>}
          {["DRAFT", "REJECTED"].includes(entry.status) && <Button variant="outline" onClick={() => onAct(entry.id, "submit")}>{m("submitForReview")}</Button>}
          {entry.status === "SUBMITTED" && (
            <>
              <Button variant="outline" onClick={() => onAct(entry.id, "approve")}>{tc("approve")}</Button>
              <Button variant="destructive" onClick={() => onAct(entry.id, "reject")}>{tc("reject")}</Button>
            </>
          )}
          {entry.status === "APPROVED" && <Button onClick={() => onAct(entry.id, "post")}>{tc("post")}</Button>}
          {entry.status === "POSTED" && !entry.reversal && !entry.reversedAt && !entry.reversalOf && <Button variant="destructive" onClick={() => setShowReverse(true)}><RotateCcw className="h-4 w-4" />{m("reverse")}</Button>}
          {["DRAFT", "REJECTED"].includes(entry.status) && <Button variant="destructive" onClick={() => onAct(entry.id, "delete")}>{tc("delete")}</Button>}
          <Button variant="ghost" onClick={onClose}>{tc("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditJournalDialog({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: (updated?: any) => void }) {
  const m = useTranslations("journals");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const { dateTime } = useFormatters();
  const tPage = useTranslations("pages");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [summary, setSummary] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [lines, setLines] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/accounting/accounts").then(r => r.json()),
      fetch(`/api/accounting/journals/${id}`).then(r => r.json()),
    ]).then(([aData, entry]) => {
      setAccounts(aData.items ?? []);
      if (entry) {
        setSummary(entry.summary || "");
        setEntryDate(entry.entryDate ? new Date(entry.entryDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
        setLines((entry.lines || []).map((l: any) => ({
          accountId: l.accountId,
          debit: Number(l.debit),
          credit: Number(l.credit),
          memo: l.memo ?? "",
        })));
      }
      setLoaded(true);
    });
  }, [id]);

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  function update(idx: number, patch: any) { const n = [...lines]; n[idx] = { ...n[idx], ...patch }; setLines(n); }
  function add() { setLines([...lines, { accountId: "", debit: 0, credit: 0, memo: "" }]); }
  function remove(idx: number) { setLines(lines.filter((_, i) => i !== idx)); }

  async function save() {
    if (!balanced) return toast.error(m("mustBalance"));
    if (lines.some((l) => !l.accountId)) return toast.error(m("accountRequired"));
    setSaving(true);
    try {
      const res = await fetch(`/api/accounting/journals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, entryDate, lines }),
      });
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      const saved = await res.json();
      toast.success(f("updated"));
      onSaved(saved);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (!loaded) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{m("edit")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>{m("entryDate")}</Label><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
          <div className="space-y-1 col-span-2"><Label>{f("summary")}</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={m("summaryExample")} /></div>
        </div>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">{f("account")}</th><th className="p-2 w-32">{f("debit")}</th><th className="p-2 w-32">{f("credit")}</th><th className="p-2 text-left">{f("summary")}</th><th className="p-2 w-10"></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={l.accountId} onChange={(e) => update(i, { accountId: e.target.value })}>
                      <option value="">{m("selectAccount")}</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><Input inputMode="numeric" className="[appearance:textfield]" placeholder="0" value={l.debit || ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); update(i, { debit: v, credit: 0 }); }} /></td>
                  <td className="p-2"><Input inputMode="numeric" className="[appearance:textfield]" placeholder="0" value={l.credit || ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); update(i, { credit: v, debit: 0 }); }} /></td>
                  <td className="p-2"><Input value={l.memo ?? ""} onChange={(e) => update(i, { memo: e.target.value })} /></td>
                  <td className="p-2"><Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2"><Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" />{m("addLine")}</Button></div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-muted-foreground">{m("debitTotal")}</div><div className="font-medium">{formatMoney(totalDebit)}</div></div>
          <div><div className="text-muted-foreground">{m("creditTotal")}</div><div className="font-medium">{formatMoney(totalCredit)}</div></div>
          <div><div className="text-muted-foreground">{tc("status")}</div><div className={balanced ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>{balanced ? m("balanced") : m("unbalanced")}</div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{tc("cancel")}</Button><Button onClick={save} disabled={!balanced || saving}>{saving ? tc("saving") : "儲存修改"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
