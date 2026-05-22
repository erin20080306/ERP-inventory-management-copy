"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Search, Eye, Download, Printer, FileDown, Pencil, Save, X } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";

export function JournalClient() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [view, setView] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [prefillDraft, setPrefillDraft] = useState<any>(null);
  const customCols = useCustomColumns("journals");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const [inlineRow, setInlineRow] = useState<Record<string, any>>({});
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);

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
        } catch {}
      }
    }
  }, []);
  const pageSize = 20;

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`/api/accounting/journals?${params}`);
    const d = await res.json();
    setRows(d.items);
    setTotal(d.total);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, fromDate, toDate]);

  async function act(id: string, action: string) {
    try {
      const res = await fetch(`/api/accounting/journals/${id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      toast.success("已處理");
      load();
      setView(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function saveInlineJournal(r: any) {
    const draft = inlineRow[r.id];
    if (!draft) return;
    setInlineSaving(r.id);
    try {
      const res = await fetch(`/api/accounting/journals/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-header", summary: draft.summary, entryDate: draft.entryDate }) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
      setInlineRow((p) => { const n = { ...p }; delete n[r.id]; return n; });
      load();
    } catch (e: any) { toast.error(e.message); } finally { setInlineSaving(null); }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜尋傳票編號 / 摘要" className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
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
                { key: "number", title: "傳票編號" },
                { key: "date", title: "日期" },
                { key: "summary", title: "摘要" },
                { key: "account", title: "科目" },
                { key: "debit", title: "借方" },
                { key: "credit", title: "貸方" },
                { key: "memo", title: "分錄摘要" },
                { key: "status", title: "狀態" },
              ]);
              downloadCSV(`journals-${new Date().toISOString().slice(0, 10)}.csv`, csv);
              toast.success("已匯出 CSV");
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
            downloadExcel("journals", "傳票管理", flat, [
              { key: "number", title: "傳票編號" },
              { key: "date", title: "日期" },
              { key: "summary", title: "摘要" },
              { key: "account", title: "科目" },
              { key: "debit", title: "借方" },
              { key: "credit", title: "貸方" },
              { key: "memo", title: "分錄摘要" },
              { key: "status", title: "狀態" },
            ]);
            toast.success("已匯出 Excel");
          }}><FileDown className="h-4 w-4" />Excel</Button>
          <Button variant="outline" disabled={pdfBusy} onClick={async () => {
            setPdfBusy(true);
            try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF("傳票管理", "journals"); } finally { setPdfBusy(false); }
          }}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <Button variant="outline" onClick={() => {
            const periodEnd = prompt("請輸入結帳日期 (YYYY-MM-DD):");
            if (!periodEnd) return;
            const isYearEnd = confirm("是否為年結？（結轉到保留盈餘）\n取消則為月結（結轉到本期損益）");
            if (confirm(`確定要${isYearEnd ? "年結" : "月結"}嗎？日期：${periodEnd}`)) {
              fetch("/api/accounting/closing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ periodEnd, isYearEnd }),
              }).then(r => r.json()).then(d => {
                if (d.ok) {
                  toast.success(`${isYearEnd ? "年結" : "月結"}完成：${d.summary}`);
                  load();
                } else {
                  toast.error(d.error || "結帳失敗");
                }
              }).catch(e => toast.error(e.message));
            }
          }}>結帳</Button>
          <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" />新增傳票</Button>
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span>💡 自訂欄位可使用 ↑↓ 按鈕調整順序</span>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>編號</TH><TH>日期</TH><TH>摘要</TH><TH>借方</TH><TH>貸方</TH><TH>狀態</TH><TH>操作人員</TH>{customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}<TH className="w-20 text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={8} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
          {!loading && rows.length === 0 && <TR><TD colSpan={8}><EmptyState /></TD></TR>}
          {!loading && rows.map((r) => {
            const debit = r.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
            const credit = r.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
            const isEditing = !!inlineRow[r.id];
            return (
              <TR key={r.id} className={isEditing ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
                <TD className="font-mono text-xs">{r.number}</TD>
                <TD>{isEditing ? <Input type="date" value={inlineRow[r.id]?.entryDate ?? ""} onChange={(e) => setInlineRow((p) => ({ ...p, [r.id]: { ...p[r.id], entryDate: e.target.value } }))} className="h-8 text-sm w-36" /> : formatDate(r.entryDate)}</TD>
                <TD>{isEditing ? <Input value={inlineRow[r.id]?.summary ?? ""} onChange={(e) => setInlineRow((p) => ({ ...p, [r.id]: { ...p[r.id], summary: e.target.value } }))} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Enter") saveInlineJournal(r); }} /> : r.summary}</TD>
                <TD>{formatMoney(debit)}</TD>
                <TD>{formatMoney(credit)}</TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
                {customCols.columns.map((cc) => { const ck = `${r.id}_${cc.id}`; const v = getCustomFieldValues("journals", r.id); const isE = editingCells[ck]; return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={v[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue("journals", r.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [ck]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 px-1 py-0.5 rounded min-h-[24px] inline-block min-w-[40px]" onClick={() => setEditingCells((p) => ({ ...p, [ck]: true }))}>{v[cc.id] || "—"}</span>}</TD>; })}
                <TD className="text-right flex items-center justify-end gap-0">
                  {isEditing ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => saveInlineJournal(r)} disabled={inlineSaving === r.id}>{inlineSaving === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-emerald-600" />}</Button>
                      <Button variant="ghost" size="icon" onClick={() => setInlineRow((p) => { const n = { ...p }; delete n[r.id]; return n; })}><X className="h-4 w-4 text-gray-500" /></Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => setView(r)} title="查看"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setInlineRow((p) => ({ ...p, [r.id]: { summary: r.summary, entryDate: r.entryDate?.slice(0, 10) ?? "" } }))} title="行內編輯"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" title="刪除" onClick={() => { if (confirm(`確定刪除 ${r.number}？注意：已過帳傳票刪除可能會影響財務報表`)) act(r.id, "delete"); }}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
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
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一頁</Button>
        </div>
      </div>
      <CreateJournalDialog open={openNew} onClose={() => { setOpenNew(false); setPrefillDraft(null); }} onCreated={() => { setOpenNew(false); setPrefillDraft(null); load(); }} prefillDraft={prefillDraft} />
      {view && <ViewJournalDialog entry={view} onClose={() => setView(null)} onAct={act} onEdit={(id: string) => { setView(null); setEditId(id); }} />}
      {editId && <EditJournalDialog id={editId} onClose={() => setEditId(null)} onSaved={(updated) => { setEditId(null); if (updated) { setRows((prev) => prev.map((r) => r.id === updated.id ? updated : r)); } else { load(); } }} />}
      <CustomColumnDialog module="journals" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}

function CreateJournalDialog({ open, onClose, onCreated, prefillDraft }: any) {
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
    if (!balanced) return toast.error("借貸必須平衡且金額不可為 0");
    if (lines.some((l) => !l.accountId)) return toast.error("請選擇科目");
    setSaving(true);
    try {
      const res = await fetch("/api/accounting/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, entryDate, lines }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已建立");
      onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>新增傳票</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>傳票日期</Label><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
          <div className="space-y-1 col-span-2"><Label>摘要</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="例: 現銷商品" /></div>
        </div>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">科目</th><th className="p-2 w-32">借方</th><th className="p-2 w-32">貸方</th><th className="p-2 text-left">摘要</th><th className="p-2 w-10"></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={l.accountId} onChange={(e) => update(i, { accountId: e.target.value })}>
                      <option value="">選擇科目</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><Input inputMode="decimal" className="[appearance:textfield]" placeholder="0" value={l.debit || ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); update(i, { debit: v, credit: 0 }); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const next = document.querySelector<HTMLElement>(`[data-jr="${i + 1}-d"]`); if (next) next.focus(); else add(); setTimeout(() => document.querySelector<HTMLElement>(`[data-jr="${i + 1}-d"]`)?.focus(), 50); }}} data-jr={`${i}-d`} /></td>
                  <td className="p-2"><Input inputMode="decimal" className="[appearance:textfield]" placeholder="0" value={l.credit || ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); update(i, { credit: v, debit: 0 }); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const next = document.querySelector<HTMLElement>(`[data-jr="${i + 1}-c"]`); if (next) next.focus(); else add(); setTimeout(() => document.querySelector<HTMLElement>(`[data-jr="${i + 1}-c"]`)?.focus(), 50); }}} data-jr={`${i}-c`} /></td>
                  <td className="p-2"><Input value={l.memo ?? ""} onChange={(e) => update(i, { memo: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const next = document.querySelector<HTMLElement>(`[data-jr="${i + 1}-d"]`); if (next) next.focus(); else add(); setTimeout(() => document.querySelector<HTMLElement>(`[data-jr="${i + 1}-d"]`)?.focus(), 50); }}} /></td>
                  <td className="p-2"><Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2"><Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" />新增分錄</Button></div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-muted-foreground">借方合計</div><div className="font-medium">{formatMoney(totalDebit)}</div></div>
          <div><div className="text-muted-foreground">貸方合計</div><div className="font-medium">{formatMoney(totalCredit)}</div></div>
          <div><div className="text-muted-foreground">狀態</div><div className={balanced ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>{balanced ? "已平衡" : "未平衡"}</div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={save} disabled={!balanced || saving}>{saving ? "儲存中..." : "儲存"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewJournalDialog({ entry, onClose, onAct, onEdit }: any) {
  const totalDebit = entry.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
  const totalCredit = entry.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>傳票 {entry.number} <StatusBadge status={entry.status} /></DialogTitle></DialogHeader>
        <div className="text-sm">日期：{formatDate(entry.entryDate)}　摘要：{entry.summary || "—"}</div>
        <table className="w-full text-sm border rounded-md">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">科目</th><th className="p-2 text-right">借方</th><th className="p-2 text-right">貸方</th><th className="p-2 text-left">摘要</th></tr></thead>
          <tbody>
            {entry.lines.map((l: any) => (
              <tr key={l.id} className="border-t"><td className="p-2">{l.account.code} {l.account.name}</td><td className="p-2 text-right">{Number(l.debit) > 0 ? formatMoney(l.debit) : "—"}</td><td className="p-2 text-right">{Number(l.credit) > 0 ? formatMoney(l.credit) : "—"}</td><td className="p-2">{l.memo ?? "—"}</td></tr>
            ))}
            <tr className="border-t font-medium bg-muted/30"><td className="p-2">合計</td><td className="p-2 text-right">{formatMoney(totalDebit)}</td><td className="p-2 text-right">{formatMoney(totalCredit)}</td><td></td></tr>
          </tbody>
        </table>
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => window.open(`/print/journal/${entry.id}`, "_blank")}>
            <Printer className="h-4 w-4" />列印
          </Button>
          {entry.status === "DRAFT" && <Button variant="outline" onClick={() => onEdit(entry.id)}><Pencil className="h-4 w-4" />修改</Button>}
          {entry.status === "DRAFT" && <Button onClick={() => onAct(entry.id, "post")}>過帳</Button>}
          {entry.status === "POSTED" && <Button variant="destructive" onClick={() => onAct(entry.id, "void")}>作廢</Button>}
          {entry.status === "DRAFT" && <Button variant="destructive" onClick={() => onAct(entry.id, "delete")}>刪除</Button>}
          <Button variant="ghost" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditJournalDialog({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
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
    if (!balanced) return toast.error("借貸必須平衡且金額不可為 0");
    if (lines.some((l) => !l.accountId)) return toast.error("請選擇科目");
    setSaving(true);
    try {
      const res = await fetch(`/api/accounting/journals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, entryDate, lines }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      const saved = await res.json();
      toast.success("已更新");
      onSaved(saved);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (!loaded) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>修改傳票</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>傳票日期</Label><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
          <div className="space-y-1 col-span-2"><Label>摘要</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="例: 現銷商品" /></div>
        </div>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">科目</th><th className="p-2 w-32">借方</th><th className="p-2 w-32">貸方</th><th className="p-2 text-left">摘要</th><th className="p-2 w-10"></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={l.accountId} onChange={(e) => update(i, { accountId: e.target.value })}>
                      <option value="">選擇科目</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><Input inputMode="decimal" className="[appearance:textfield]" placeholder="0" value={l.debit || ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); update(i, { debit: v, credit: 0 }); }} /></td>
                  <td className="p-2"><Input inputMode="decimal" className="[appearance:textfield]" placeholder="0" value={l.credit || ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); update(i, { credit: v, debit: 0 }); }} /></td>
                  <td className="p-2"><Input value={l.memo ?? ""} onChange={(e) => update(i, { memo: e.target.value })} /></td>
                  <td className="p-2"><Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2"><Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" />新增分錄</Button></div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-muted-foreground">借方合計</div><div className="font-medium">{formatMoney(totalDebit)}</div></div>
          <div><div className="text-muted-foreground">貸方合計</div><div className="font-medium">{formatMoney(totalCredit)}</div></div>
          <div><div className="text-muted-foreground">狀態</div><div className={balanced ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>{balanced ? "已平衡" : "未平衡"}</div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={save} disabled={!balanced || saving}>{saving ? "儲存中..." : "儲存修改"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
