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
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { TableHint, useColumnDrag } from "@/components/table-helpers";

const NOTE_TYPE_LABELS: Record<string, string> = {
  CHECK: "支票",
  PROMISSORY: "本票",
  DRAFT: "匯票",
  OTHER: "其他",
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已送審",
  APPROVED: "已審核",
  POSTED: "已過帳",
  VOIDED: "已作廢",
  REJECTED: "已駁回",
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
  const endpoint = kind === "receivable" ? "/api/accounting/notes-receivable" : "/api/accounting/notes-payable";
  const partyLabel = kind === "receivable" ? "客戶" : "供應商";
  const partyEndpoint = kind === "receivable" ? "/api/customers" : "/api/suppliers";
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const pageSize = 20;
  const customCols = useCustomColumns(kind === "receivable" ? "notes-receivable" : "notes-payable");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const colDrag = useColumnDrag(kind === "receivable" ? "notes-receivable" : "notes-payable", ["noteNumber", "noteType", "party", "bank", "issueDate", "dueDate", "amount", "status", "updatedBy"]);
  const [inlineEditing, setInlineEditing] = useState<Record<string, Record<string, any>>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null);

  async function load() {
    setLoading(true);
    const sp = new URLSearchParams({ q, status, page: String(page), pageSize: String(pageSize) });
    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);
    const res = await fetch(`${endpoint}?${sp}`);
    const d = await res.json();
    setRows(d.items);
    setTotal(d.total);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, q, status, fromDate, toDate]);

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

    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      saveCellAndMove(row, rowIdx + 1, colKey);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      saveCellAndMove(row, rowIdx - 1, colKey);
    } else if (e.key === "Tab") {
      e.preventDefault();
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
    setInlineSaving(row.id);
    try {
      const payload = { ...(row as any), ...draft };
      const res = await fetch(`${endpoint}/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const saved = await res.json().catch(() => null);
      toast.success("已儲存");
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
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      toast.success("已處理");
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
        const partyName = String(r[partyLabel] ?? r["公司名稱"] ?? "").trim();
        const partyId = byName.get(partyName);
        if (!partyId) { errors.push(`第 ${i + 2} 列：找不到${partyLabel} ${partyName}`); continue; }
        const noteTypeRaw = String(r["種類"] ?? "支票").trim();
        const noteTypeMap: Record<string, string> = { 支票: "CHECK", 本票: "PROMISSORY", 匯票: "DRAFT", 其他: "OTHER" };
        const payload: any = {
          noteNumber: String(r["票號"] ?? "").trim(),
          noteType: noteTypeMap[noteTypeRaw] ?? "CHECK",
          amount: Number(r["金額"] ?? 0),
          issueDate: r["票面日期"] || undefined,
          dueDate: r["到期日"] || undefined,
          remark: r["備註"] ?? undefined,
        };
        if (kind === "receivable") {
          payload.customerId = partyId;
          payload.bankName = r["付款銀行"] ?? undefined;
        } else {
          payload.supplierId = partyId;
        }
        try {
          const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!res.ok) errors.push(`第 ${i + 2} 列：${(await res.json()).error || "失敗"}`);
          else success++;
        } catch (err: any) { errors.push(`第 ${i + 2} 列：${err.message}`); }
      }
      if (errors.length === 0) toast.success(`已匯入 ${success} 筆`);
      else toast.error(`成功 ${success} / 失敗 ${errors.length}`);
      load();
    } catch (err: any) { toast.error(err.message); }
    finally { e.target.value = ""; }
  }

  async function exportExcel() {
    const sp = new URLSearchParams({ q, status, pageSize: "10000" });
    const res = await fetch(`${endpoint}?${sp}`);
    const d = await res.json();
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel(`notes-${kind}`, kind === "receivable" ? "應收票據" : "應付票據", d.items, [
      { key: "noteNumber", title: "票號" },
      { key: "noteType", title: "種類", get: (r: any) => NOTE_TYPE_LABELS[r.noteType] ?? r.noteType },
      { key: "party", title: partyLabel, get: (r: any) => (kind === "receivable" ? r.customer : r.supplier)?.companyName ?? "" },
      { key: "issueDate", title: "票面日期", get: (r: any) => formatDate(r.issueDate) },
      { key: "dueDate", title: "到期日", get: (r: any) => formatDate(r.dueDate) },
      { key: "amount", title: "金額", get: (r: any) => Number(r.amount) },
      { key: "status", title: "狀態", get: (r: any) => STATUS_LABELS[r.status] ?? r.status },
      { key: "remark", title: "備註" },
    ]);
    toast.success("已匯出 Excel");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder={`搜尋票號 / ${partyLabel} / 銀行`} className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">全部狀態</option>
            <option value="DRAFT">草稿</option>
            <option value="SUBMITTED">已送審</option>
            <option value="APPROVED">已審核</option>
            <option value="POSTED">已過帳</option>
            <option value="VOIDED">已作廢</option>
            <option value="REJECTED">已駁回</option>
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
            <Upload className="h-4 w-4" />匯入
          </Button>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4" />新增票據
          </Button>
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
        </div>
      </div>

      <TableHint />
      <Table>
        <THead>
          <TR>
            <TH {...colDrag.thProps("noteNumber")}>票號</TH><TH {...colDrag.thProps("noteType")}>種類</TH><TH {...colDrag.thProps("party")}>{partyLabel}</TH>
            {kind === "receivable" && <TH {...colDrag.thProps("bank")}>付款銀行</TH>}
            {kind === "payable" && <TH {...colDrag.thProps("bank")}>開票銀行</TH>}
            <TH {...colDrag.thProps("issueDate")}>票面日期</TH><TH {...colDrag.thProps("dueDate")}>到期日</TH><TH {...colDrag.thProps("amount")} className="text-right">金額</TH><TH {...colDrag.thProps("status")}>狀態</TH><TH {...colDrag.thProps("updatedBy")}>操作人員</TH>
            {customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}
            <TH className="text-right w-40">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={10} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
          {!loading && rows.length === 0 && <TR><TD colSpan={10}><EmptyState /></TD></TR>}
          {!loading && rows.map((r) => {
            const draft = inlineEditing[r.id];
            const isRowEditing = !!draft;
            return (
            <TR key={r.id} className={isRowEditing ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
              <TD className="font-mono text-xs">{r.noteNumber}</TD>
              <TD>{NOTE_TYPE_LABELS[r.noteType] ?? r.noteType}</TD>
              <TD>{(kind === "receivable" ? r.customer : r.supplier)?.companyName ?? "—"}</TD>
              <TD
                className={editableFields.includes("bank") ? "cursor-cell hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors" : ""}
                onClick={() => { if (editableFields.includes("bank")) startCellEdit(r, "bank"); }}
              >
                {activeCell?.rowId === r.id && activeCell?.colKey === "bank" ? (
                  <Input
                    value={draft?.bank ?? (kind === "receivable" ? r.bankName : r.bankAccount?.bankName ?? r.bankAccount?.name) ?? ""}
                    autoFocus
                    onChange={(e) => setInlineEditing((prev) => ({ ...prev, [r.id]: { ...prev[r.id], bank: e.target.value } }))}
                    className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                    onKeyDown={(e) => handleCellKeyDown(e, r, "bank")}
                  />
                ) : (
                  kind === "receivable" ? (r.bankName ?? "—") : (r.bankAccount?.bankName ?? r.bankAccount?.name ?? "—")
                )}
              </TD>
              <TD
                className={editableFields.includes("issueDate") ? "cursor-cell hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors" : ""}
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
                  />
                ) : (
                  formatDate(r.issueDate)
                )}
              </TD>
              <TD
                className={editableFields.includes("dueDate") ? "cursor-cell hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors" : ""}
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
                  />
                ) : (
                  formatDate(r.dueDate)
                )}
              </TD>
              <TD className="text-right font-medium">{formatMoney(r.amount)}</TD>
              <TD><Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status] ?? r.status}</Badge></TD>
              <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
              <TD className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" title="編輯" onClick={() => setEditId(r.id)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {r.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => act(r.id, "submit")}>送出</Button>}
                  {r.status === "SUBMITTED" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => act(r.id, "approve")}>審核</Button>
                      <Button size="sm" variant="destructive" onClick={() => act(r.id, "reject")}>駁回</Button>
                    </>
                  )}
                  {r.status === "APPROVED" && <Button size="sm" onClick={() => act(r.id, "post")}>過帳</Button>}
                  {r.status === "POSTED" && <Button size="sm" variant="destructive" onClick={() => act(r.id, "void")}>作廢</Button>}
                </div>
              </TD>
              {customCols.columns.map((cc) => {
                const cellKey = `${r.id}_${cc.id}`;
                const vals = getCustomFieldValues(kind === "receivable" ? "notes-receivable" : "notes-payable", r.id);
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
                          setCustomFieldValue(kind === "receivable" ? "notes-receivable" : "notes-payable", r.id, cc.id, e.target.value);
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
            );
            })}
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
      {openNew && <NewNoteDialog kind={kind} endpoint={endpoint} partyLabel={partyLabel} partyEndpoint={partyEndpoint} onClose={() => setOpenNew(false)} onCreated={(saved: any) => { setOpenNew(false); if (saved) { setRows((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} />}
      {editId && <NewNoteDialog kind={kind} endpoint={endpoint} partyLabel={partyLabel} partyEndpoint={partyEndpoint} row={rows.find((r) => r.id === editId)} onClose={() => setEditId(null)} onCreated={(saved: any) => { setEditId(null); if (saved) { setRows((prev) => prev.map((r) => r.id === saved.id ? saved : r)); } else { load(); } }} />}
      <CustomColumnDialog module={kind === "receivable" ? "notes-receivable" : "notes-payable"} columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}

function NewNoteDialog({ kind, endpoint, partyLabel, partyEndpoint, onClose, onCreated, row }: any) {
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
    if (!form.partyId) return toast.error(`請選擇${partyLabel}`);
    if (!form.amount || Number(form.amount) <= 0) return toast.error("金額必須大於 0");
    if (!form.dueDate) return toast.error("請選擇到期日");
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
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const saved = await res.json();
      toast.success("已儲存");
      onCreated(saved);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{row ? "編輯" : "新增"}{kind === "receivable" ? "應收" : "應付"}票據</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>票據種類</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.noteType} onChange={(e) => setForm({ ...form, noteType: e.target.value })}>
              <option value="CHECK">支票</option>
              <option value="PROMISSORY">本票</option>
              <option value="DRAFT">匯票</option>
              <option value="OTHER">其他</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>票號 *</Label>
            <Input value={form.noteNumber} onChange={(e) => setForm({ ...form, noteNumber: e.target.value })} placeholder="留空自動編號" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{partyLabel} *</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
              <option value="">請選擇</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.code} {p.companyName}</option>)}
            </select>
          </div>
          {kind === "receivable" && (
            <>
              <div className="space-y-1"><Label>付款銀行</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
              <div className="space-y-1"><Label>分行</Label><Input value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} /></div>
              <div className="space-y-1 col-span-2"><Label>發票人</Label><Input value={form.drawerName} onChange={(e) => setForm({ ...form, drawerName: e.target.value })} /></div>
            </>
          )}
          {kind === "payable" && (
            <>
              <div className="space-y-1 col-span-2">
                <Label>開立銀行帳戶 (甲存)</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}>
                  <option value="">未指定</option>
                  {banks.filter((b: any) => b.accountType === "CHECKING").map((b: any) => (
                    <option key={b.id} value={b.id}>{b.code} {b.name} ({b.bankName ?? ""})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 col-span-2"><Label>抬頭</Label><Input value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} /></div>
            </>
          )}
          <div className="space-y-1"><Label>金額 *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label>票面日期</Label><Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>到期日 *</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>備註</Label><Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
