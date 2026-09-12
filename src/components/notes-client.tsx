"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Search, Loader2, CheckCircle2, XCircle, Ban, Trash2, FileSpreadsheet, Upload, Pencil } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { useCustomColumns, useCustomFieldValues, CustomColumnDialog, CustomColumnButton, CustomFieldGridCell } from "@/components/custom-columns";
import { readSessionCache, TableHint, TableSkeletonRows, useColumnDrag, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";
import { useTranslations } from "next-intl";

// 值是 fields 命名空間的翻譯鍵；資料庫存的是 CHECK / DRAFT 等代碼，不受語言影響。
const NOTE_TYPE_LABEL_KEYS: Record<string, string> = {
  CHECK: "cheque",
  PROMISSORY: "promissoryNote",
  DRAFT: "billOfExchange",
  OTHER: "other",
};
const STATUS_LABEL_KEYS: Record<string, string> = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approvedState",
  POSTED: "posted",
  VOIDED: "voided",
  REJECTED: "rejectedState",
};
const STATUS_VARIANTS: Record<string, any> = {
  DRAFT: "outline",
  SUBMITTED: "info",
  APPROVED: "warning",
  POSTED: "success",
  VOIDED: "danger",
  REJECTED: "danger",
};

export function NotesClient({ kind }: { kind: "receivable" | "payable" }) {
  const n = useTranslations("notes");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const endpoint = kind === "receivable" ? "/api/accounting/notes-receivable" : "/api/accounting/notes-payable";
  const partyLabel = kind === "receivable" ? f("customer") : f("supplier");
  const partyEndpoint = kind === "receivable" ? "/api/customers" : "/api/suppliers";
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const pageSize = 20;
  const customFieldModule = kind === "receivable" ? "notes-receivable" : "notes-payable";
  const customCols = useCustomColumns(customFieldModule);
  const customFieldValues = useCustomFieldValues(customFieldModule, rows.map((row) => row.id));
  const colDrag = useColumnDrag(kind === "receivable" ? "notes-receivable" : "notes-payable", ["noteNumber", "noteType", "party", "bank", "issueDate", "dueDate", "amount", "status", "updatedBy"]);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);

  async function load() {
    const sp = new URLSearchParams({ q: debouncedQ, status, page: String(page), pageSize: String(pageSize) });
    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);
    const cacheKey = `notes:${kind}:${sp.toString()}`;
    const cached = readSessionCache<{ items: any[]; total: number }>(cacheKey);
    if (cached) {
      setRows(cached.items ?? []);
      setTotal(cached.total ?? 0);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`${endpoint}?${sp}`);
      const d = await res.json();
      const next = { items: d.items ?? [], total: d.total ?? 0 };
      setRows(next.items);
      setTotal(next.total);
      writeSessionCache(cacheKey, next);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, debouncedQ, status, fromDate, toDate]);

  const editableFields = ["issueDate", "dueDate", "bank"];

  function startCellEdit(row: any, colKey: string) {
    if (!inlineEditing[row.id]) {
      const draft: Record<string, any> = {};
      editableFields.forEach((f) => { draft[f] = (row as any)[f] ?? ""; });
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
    
    // 連貫性確認：如果狀態改為 VOIDED（作廢）
    if (draft.status === "VOIDED" && row.status !== "VOIDED") {
      if (typeof window !== "undefined") {
        const confirmed = confirm(n("confirmVoid"));
        if (!confirmed) {
          cancelInlineEdit(row.id);
          return;
        }
      }
    }
    
    // 連貫性確認：如果狀態改為 POSTED（過帳）
    if (draft.status === "POSTED" && row.status !== "POSTED") {
      if (typeof window !== "undefined") {
        const confirmed = confirm(n("confirmPost"));
        if (!confirmed) {
          cancelInlineEdit(row.id);
          return;
        }
      }
    }
    
    setInlineSaving(row.id);
    try {
      const payload = { ...(row as any), ...draft };
      const res = await fetch(`${endpoint}/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      const saved = await res.json().catch(() => null);
      toast.success(tc("saved"));
      setInlineEditing((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      setRows((prev) => prev.map((r) => r.id === row.id ? (saved && saved.id ? saved : { ...r, ...draft }) : r));
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

  async function act(id: string, action: string) {
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || f("actionFailed"));
      toast.success(f("settled"));
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const { readExcelFile } = await import("@/lib/excel");
      const rows = await readExcelFile(file);
      // 先拿 parties 對照表 (公司名稱 → ID)
      const partyRes = await fetch(`${partyEndpoint}?pageSize=10000`);
      const parties = (await partyRes.json()).items as any[];
      const byName = new Map<string, string>(parties.map((p) => [p.companyName, p.id]));
      let success = 0; const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] as any;
        const partyName = String(r[partyLabel] ?? r[f("companyName")] ?? "").trim();
        const partyId = byName.get(partyName);
        if (!partyId) { errors.push(n("partyNotFound", { row: i + 2, party: partyLabel, name: partyName })); continue; }
        const noteTypeRaw = String(r[f("category")] ?? f("cheque")).trim();
        const noteTypeMap: Record<string, string> = { 支票: "CHECK", 本票: "PROMISSORY", 匯票: "DRAFT", 其他: "OTHER" };
        const payload: any = {
          noteNumber: String(r[f("noteNo")] ?? "").trim(),
          noteType: noteTypeMap[noteTypeRaw] ?? "CHECK",
          amount: Number(r[tc("amount")] ?? 0),
          issueDate: r[n("issueDate")] || undefined,
          dueDate: r[f("dueDate")] || undefined,
          remark: r[tc("remark")] ?? undefined,
        };
        if (kind === "receivable") {
          payload.customerId = partyId;
          payload.bankName = r[n("payingBank")] ?? undefined;
        } else {
          payload.supplierId = partyId;
        }
        try {
          const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!res.ok) errors.push(tt("rowError", { row: i + 2, message: (await res.json()).error || f("failed") }));
          else success++;
        } catch (err: any) { errors.push(tt("rowError", { row: i + 2, message: err.message })); }
      }
      if (errors.length === 0) toast.success(tt("importedCount", { count: success }));
      else toast.error(tt("importPartial", { success, failed: errors.length }));
      load();
    } catch (err: any) { toast.error(err.message); }
    finally { e.target.value = ""; }
  }

  async function exportExcel() {
    const sp = new URLSearchParams({ q, status, pageSize: "10000" });
    const res = await fetch(`${endpoint}?${sp}`);
    const d = await res.json();
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel(`notes-${kind}`, kind === "receivable" ? n("receivableNotes") : n("payableNotes"), d.items, [
      { key: "noteNumber", title: f("noteNo") },
      { key: "noteType", title: f("category"), get: (r: any) => f(NOTE_TYPE_LABEL_KEYS[r.noteType]) ?? r.noteType },
      { key: "party", title: partyLabel, get: (r: any) => (kind === "receivable" ? r.customer : r.supplier)?.companyName ?? "" },
      { key: "issueDate", title: n("issueDate"), get: (r: any) => formatDate(r.issueDate) },
      { key: "dueDate", title: f("dueDate"), get: (r: any) => formatDate(r.dueDate) },
      { key: "amount", title: tc("amount"), get: (r: any) => Number(r.amount) },
      { key: "status", title: tc("status"), get: (r: any) => f(STATUS_LABEL_KEYS[r.status]) ?? r.status },
      { key: "remark", title: tc("remark") },
    ]);
    toast.success(tt("exportedExcel"));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder={n("searchPlaceholder", { party: partyLabel })} className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">{f("allStatuses")}</option>
            <option value="DRAFT">{f("draft")}</option>
            <option value="SUBMITTED">{f("submitted")}</option>
            <option value="APPROVED">{f("approvedState")}</option>
            <option value="POSTED">{f("posted")}</option>
            <option value="VOIDED">{f("voided")}</option>
            <option value="REJECTED">{f("rejectedState")}</option>
          </select>
          <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
          <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" />Excel
          </Button>
          <input id={`import-notes-${kind}`} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel} />
          <Button variant="outline" onClick={() => document.getElementById(`import-notes-${kind}`)?.click()}>
            <Upload className="h-4 w-4" />{tc("import")}
          </Button>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4" />{n("createNote")}
          </Button>
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
        </div>
      </div>

      <TableHint />
      <Table>
        <THead onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("manageCustomColumns")}>
          <TR>
            <TH {...colDrag.thProps("noteNumber")}>{f("noteNo")}</TH><TH {...colDrag.thProps("noteType")}>{f("category")}</TH><TH {...colDrag.thProps("party")}>{partyLabel}</TH>
            {kind === "receivable" && <TH {...colDrag.thProps("bank")}>{n("payingBank")}</TH>}
            {kind === "payable" && <TH {...colDrag.thProps("bank")}>{n("issuingBank")}</TH>}
            <TH {...colDrag.thProps("issueDate")}>{n("issueDate")}</TH><TH {...colDrag.thProps("dueDate")}>{f("dueDate")}</TH><TH {...colDrag.thProps("amount")} className="text-right">{tc("amount")}</TH><TH {...colDrag.thProps("status")}>{tc("status")}</TH><TH {...colDrag.thProps("updatedBy")}>{f("updatedBy")}</TH>
            {customCols.columns.map((cc) => <TH key={cc.id} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("rightClickColumns")}>{cc.label}</TH>)}
            <TH className="text-right w-40">{tc("actions")}</TH>
          </TR>
        </THead>
        <TBody>
          {loading && rows.length === 0 && <TableSkeletonRows columns={10 + customCols.columns.length} />}
          {!loading && rows.length === 0 && <TR><TD colSpan={10 + customCols.columns.length}><EmptyState /></TD></TR>}
          {rows.length > 0 && rows.map((r, rowIndex) => {
            const draft = inlineEditing[r.id];
            const isRowEditing = !!draft;
            return (
            <TR key={r.id} className={isRowEditing ? "bg-accent/5" : ""}>
              <TD className="font-mono text-xs">{r.noteNumber}</TD>
              <TD>{f(NOTE_TYPE_LABEL_KEYS[r.noteType]) ?? r.noteType}</TD>
              <TD>{(kind === "receivable" ? r.customer : r.supplier)?.companyName ?? "—"}</TD>
              <TD
                className={editableFields.includes("bank") ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                onClick={() => { if (editableFields.includes("bank")) startCellEdit(r, "bank"); }}
              >
                {activeCell?.rowId === r.id && activeCell?.colKey === "bank" ? (
                  <Input
                    value={draft?.bank ?? (kind === "receivable" ? r.bankName : r.bankAccount?.bankName ?? r.bankAccount?.name) ?? ""}
                    autoFocus
                    onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], bank: e.target.value } }))}
                    className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                    onKeyDown={(e) => handleCellKeyDown(e, r, "bank")}
                    ref={(el) => { if (el) el.focus(); }}
                  />
                ) : (
                  kind === "receivable" ? (r.bankName ?? "—") : (r.bankAccount?.bankName ?? r.bankAccount?.name ?? "—")
                )}
              </TD>
              <TD
                className={editableFields.includes("issueDate") ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                onClick={() => { if (editableFields.includes("issueDate")) startCellEdit(r, "issueDate"); }}
              >
                {activeCell?.rowId === r.id && activeCell?.colKey === "issueDate" ? (
                  <Input
                    type="date"
                    value={draft?.issueDate ?? r.issueDate?.slice(0, 10) ?? ""}
                    autoFocus
                    onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], issueDate: e.target.value } }))}
                    className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                    onKeyDown={(e) => handleCellKeyDown(e, r, "issueDate")}
                    ref={(el) => { if (el) el.focus(); }}
                  />
                ) : (
                  formatDate(r.issueDate)
                )}
              </TD>
              <TD
                className={editableFields.includes("dueDate") ? "cursor-cell hover:bg-muted/60 transition-colors" : ""}
                onClick={() => { if (editableFields.includes("dueDate")) startCellEdit(r, "dueDate"); }}
              >
                {activeCell?.rowId === r.id && activeCell?.colKey === "dueDate" ? (
                  <Input
                    type="date"
                    value={draft?.dueDate ?? r.dueDate?.slice(0, 10) ?? ""}
                    autoFocus
                    onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], dueDate: e.target.value } }))}
                    className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                    onKeyDown={(e) => handleCellKeyDown(e, r, "dueDate")}
                    ref={(el) => { if (el) el.focus(); }}
                  />
                ) : (
                  formatDate(r.dueDate)
                )}
              </TD>
              <TD className="text-right font-medium">{formatMoney(r.amount)}</TD>
              <TD><Badge variant={STATUS_VARIANTS[r.status]}>{f(STATUS_LABEL_KEYS[r.status]) ?? r.status}</Badge></TD>
              <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
              <TD className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" title={tc("edit")} onClick={() => setEditId(r.id)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {r.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => act(r.id, "submit")}>{tc("submit")}</Button>}
                  {r.status === "SUBMITTED" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => act(r.id, "approve")}>{tc("approve")}</Button>
                      <Button size="sm" variant="destructive" onClick={() => act(r.id, "reject")}>{tc("reject")}</Button>
                    </>
                  )}
                  {r.status === "APPROVED" && <Button size="sm" onClick={() => act(r.id, "post")}>{tc("post")}</Button>}
                  {r.status === "POSTED" && <Button size="sm" variant="destructive" onClick={() => act(r.id, "void")}>{tc("void")}</Button>}
                </div>
              </TD>
              {customCols.columns.map((cc, columnIndex) => { const vals = customFieldValues.getValues(r.id); return <TD key={cc.id}><CustomFieldGridCell gridId={`notes-${kind}`} rowId={r.id} rowIndex={rowIndex} column={cc} columnIndex={columnIndex} rowIds={rows.map((row) => row.id)} columns={customCols.columns} value={vals[cc.id] ?? ""} saveValues={customFieldValues.saveValues} onManageColumns={() => customCols.setOpen(true)} /></TD>; })}
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
      {openNew && <NewNoteDialog kind={kind} endpoint={endpoint} partyLabel={partyLabel} partyEndpoint={partyEndpoint} onClose={() => setOpenNew(false)} onCreated={(saved: any) => { setOpenNew(false); if (saved) { setRows((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} />}
      {editId && <NewNoteDialog kind={kind} endpoint={endpoint} partyLabel={partyLabel} partyEndpoint={partyEndpoint} row={rows.find((r) => r.id === editId)} onClose={() => setEditId(null)} onCreated={(saved: any) => { setEditId(null); if (saved) { setRows((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} />}
      <CustomColumnDialog module={kind === "receivable" ? "notes-receivable" : "notes-payable"} columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}

function NewNoteDialog({ kind, endpoint, partyLabel, partyEndpoint, onClose, onCreated, row }: any) {
  const n = useTranslations("notes");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const [parties, setParties] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [form, setForm] = useState({
    noteNumber: "",
    noteType: "CHECK",
    partyId: "",
    bankName: "",
    branchName: "",
    drawerName: "",
    payeeName: "",
    bankAccountId: "",
    amount: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    remark: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${partyEndpoint}?pageSize=1000`).then((r) => r.json()).then((d) => setParties(d.items ?? []));
    if (kind === "payable") {
      fetch("/api/accounting/bank-accounts").then((r) => r.json()).then((d) => setBanks(d.items ?? d ?? []));
    }
    if (row) {
      setForm({
        noteNumber: row.noteNumber || "",
        noteType: row.noteType || "CHECK",
        partyId: kind === "receivable" ? row.customerId : row.supplierId,
        bankName: row.bankName || "",
        branchName: row.branchName || "",
        drawerName: row.drawerName || "",
        payeeName: row.payeeName || "",
        bankAccountId: row.bankAccountId || "",
        amount: row.amount || "",
        issueDate: row.issueDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        dueDate: row.dueDate?.slice(0, 10) || "",
        remark: row.remark || "",
      });
    }
  }, [row, kind, partyEndpoint]);

  async function save() {
    if (!form.partyId) return toast.error(n("selectParty", { party: partyLabel }));
    if (!form.amount || Number(form.amount) <= 0) return toast.error(n("amountPositive"));
    if (!form.dueDate) return toast.error(n("dueDateRequired"));
    setSaving(true);
    try {
      const payload: any = {
        noteNumber: form.noteNumber,
        noteType: form.noteType,
        amount: Number(form.amount),
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        remark: form.remark,
      };
      if (kind === "receivable") {
        payload.customerId = form.partyId;
        payload.bankName = form.bankName;
        payload.branchName = form.branchName;
        payload.drawerName = form.drawerName;
      } else {
        payload.supplierId = form.partyId;
        payload.bankAccountId = form.bankAccountId || null;
        payload.payeeName = form.payeeName;
      }
      const res = await fetch(row ? `${endpoint}/${row.id}` : endpoint, {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id: row?.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      const saved = await res.json();
      toast.success(tc("saved"));
      onCreated(saved);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{n("noteDialogTitle", { action: row ? tc("edit") : tc("create"), kind: kind === "receivable" ? n("receivable") : n("payable") })}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{n("noteType")}</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.noteType} onChange={(e) => setForm({ ...form, noteType: e.target.value })}>
              <option value="CHECK">{f("cheque")}</option>
              <option value="PROMISSORY">{f("promissoryNote")}</option>
              <option value="DRAFT">{f("billOfExchange")}</option>
              <option value="OTHER">{f("other")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>{f("noteNo")} *</Label>
            <Input value={form.noteNumber} onChange={(e) => setForm({ ...form, noteNumber: e.target.value })} placeholder={n("autoNumberHint")} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{partyLabel} *</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
              <option value="">{f("selectPlaceholder")}</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.code} {p.companyName}</option>)}
            </select>
          </div>
          {kind === "receivable" && (
            <>
              <div className="space-y-1"><Label>{n("payingBank")}</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
              <div className="space-y-1"><Label>{f("branch")}</Label><Input value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} /></div>
              <div className="space-y-1 col-span-2"><Label>{n("drawer")}</Label><Input value={form.drawerName} onChange={(e) => setForm({ ...form, drawerName: e.target.value })} /></div>
            </>
          )}
          {kind === "payable" && (
            <>
              <div className="space-y-1 col-span-2">
                <Label>{n("issuingAccount")}</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}>
                  <option value="">{f("unspecified")}</option>
                  {banks.filter((b: any) => b.accountType === "CHECKING").map((b: any) => (
                    <option key={b.id} value={b.id}>{b.code} {b.name} ({b.bankName ?? ""})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 col-span-2"><Label>{f("payee")}</Label><Input value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} /></div>
            </>
          )}
          <div className="space-y-1"><Label>{tc("amount")} *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label>{n("issueDate")}</Label><Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>{f("dueDate")} *</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>{tc("remark")}</Label><Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc("cancel")}</Button>
          <Button onClick={save} disabled={saving}>{saving ? tc("saving") : tc("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
