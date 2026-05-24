"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Search, Loader2, TrendingDown, Trash2, Ban, FileSpreadsheet, Upload, Save, X, Pencil } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { TableHint, useColumnDrag } from "@/components/table-helpers";

const STATUS_LABELS: Record<string, string> = {
  IN_USE: "使用中", IDLE: "閒置", DISPOSED: "已處分", IMPAIRED: "減損",
};
const STATUS_VARIANTS: Record<string, any> = {
  IN_USE: "success", IDLE: "secondary", DISPOSED: "danger", IMPAIRED: "warning",
};
const METHOD_LABELS: Record<string, string> = {
  STRAIGHT_LINE: "直線法", DOUBLE_DECLINING: "倍數遞減", SUM_OF_YEARS: "年數合計", NONE: "不折舊",
};

export function FixedAssetsClient() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const pageSize = 20;
  const customCols = useCustomColumns("fixed-assets");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const [inlineRow, setInlineRow] = useState<Record<string, any>>({});
  const colDrag = useColumnDrag("fixed-assets", ["code", "name", "category", "acquireDate", "acquireCost", "accDep", "bookValue", "method", "status", "updatedBy"]);
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);

  async function saveInlineAsset(r: any) {
    const draft = inlineRow[r.id]; if (!draft) return;
    setInlineSaving(r.id);
    try {
      const res = await fetch(`/api/accounting/fixed-assets/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-header", ...draft }) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存"); setInlineRow((p) => { const n = { ...p }; delete n[r.id]; return n; }); load();
    } catch (e: any) { toast.error(e.message); } finally { setInlineSaving(null); }
  }

  async function load() {
    setLoading(true);
    const sp = new URLSearchParams({ q, status, page: String(page), pageSize: String(pageSize) });
    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);
    const res = await fetch(`/api/accounting/fixed-assets?${sp}`);
    const d = await res.json();
    setRows(d.items); setTotal(d.total); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, q, status, fromDate, toDate]);

  async function act(id: string, action: string, body?: any) {
    try {
      const res = await fetch(`/api/accounting/fixed-assets/${id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action, ...(body ?? {}) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      toast.success("已處理"); load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const { readExcelFile } = await import("@/lib/excel");
      const rows = await readExcelFile(file);
      const methodMap: Record<string, string> = { "直線法": "STRAIGHT_LINE", "倍數遞減": "DOUBLE_DECLINING", "年數合計": "SUM_OF_YEARS", "不折舊": "NONE" };
      let success = 0; const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] as any;
        const payload: any = {
          code: String(r["編號"] ?? r.code ?? "").trim(),
          name: String(r["名稱"] ?? r.name ?? "").trim(),
          category: r["分類"] ?? undefined,
          accountCode: String(r["科目代碼"] ?? r.accountCode ?? "").trim() || undefined,
          acquireDate: r["取得日"] || undefined,
          acquireCost: Number(r["取得成本"] ?? r.acquireCost ?? 0),
          residualValue: Number(r["殘值"] ?? r.residualValue ?? 0),
          usefulLifeMonths: Number(r["耐用年限(月)"] ?? r["耐用年限"] ?? r.usefulLifeMonths ?? 60),
          method: methodMap[String(r["折舊法"] ?? r["折舊方法"] ?? "").trim()] ?? "STRAIGHT_LINE",
          location: r["位置"] ?? undefined,
          serialNumber: r["序號"] ?? undefined,
        };
        try {
          const res = await fetch("/api/accounting/fixed-assets?upsert=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
    const res = await fetch(`/api/accounting/fixed-assets?${sp}`);
    const d = await res.json();
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel("fixed-assets", "固定資產目錄", d.items, [
      { key: "code", title: "編號" }, { key: "name", title: "名稱" },
      { key: "category", title: "分類" }, { key: "accountCode", title: "科目代碼" },
      { key: "acquireDate", title: "取得日", get: (r: any) => formatDate(r.acquireDate) },
      { key: "acquireCost", title: "取得成本", get: (r: any) => Number(r.acquireCost) },
      { key: "accumulatedDepreciation", title: "累計折舊", get: (r: any) => Number(r.accumulatedDepreciation) },
      { key: "bookValue", title: "帳面價值", get: (r: any) => Number(r.bookValue) },
      { key: "method", title: "折舊法", get: (r: any) => METHOD_LABELS[r.method] ?? r.method },
      { key: "status", title: "狀態", get: (r: any) => STATUS_LABELS[r.status] ?? r.status },
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
            <Input placeholder="搜尋編號 / 名稱 / 序號" className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">全部</option>
            <option value="IN_USE">使用中</option>
            <option value="IDLE">閒置</option>
            <option value="DISPOSED">已處分</option>
            <option value="IMPAIRED">減損</option>
          </select>
          <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
          <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
          <input id="import-fixed-assets" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel} />
          <Button variant="outline" onClick={() => document.getElementById("import-fixed-assets")?.click()}>
            <Upload className="h-4 w-4" />匯入
          </Button>
          <Button onClick={() => { setEditing(null); setOpenNew(true); }}><Plus className="h-4 w-4" />新增資產</Button>
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
        </div>
      </div>

      <TableHint />
      <Table>
        <THead>
          <TR>
            <TH {...colDrag.thProps("code")}>編號</TH><TH {...colDrag.thProps("name")}>名稱</TH><TH {...colDrag.thProps("category")}>分類</TH><TH {...colDrag.thProps("acquireDate")}>取得日</TH>
            <TH {...colDrag.thProps("acquireCost")} className="text-right">取得成本</TH><TH {...colDrag.thProps("accDep")} className="text-right">累計折舊</TH><TH {...colDrag.thProps("bookValue")} className="text-right">帳面價值</TH>
            <TH {...colDrag.thProps("method")}>折舊法</TH><TH {...colDrag.thProps("status")}>狀態</TH><TH {...colDrag.thProps("updatedBy")}>操作人員</TH>{customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}<TH className="text-right w-32">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={11} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
          {!loading && rows.length === 0 && <TR><TD colSpan={11}><EmptyState /></TD></TR>}
          {!loading && rows.map((r) => {
            const isEditing = !!inlineRow[r.id];
            return (
            <TR key={r.id} className={isEditing ? "bg-accent/5" : ""}>
              <TD className="font-mono text-xs">{isEditing ? <Input value={inlineRow[r.id]?.code ?? ""} onChange={(e) => setInlineRow((p) => ({ ...p, [r.id]: { ...p[r.id], code: e.target.value } }))} className="h-8 text-sm w-20" /> : r.code}</TD>
              <TD>{isEditing ? <Input value={inlineRow[r.id]?.name ?? ""} onChange={(e) => setInlineRow((p) => ({ ...p, [r.id]: { ...p[r.id], name: e.target.value } }))} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Enter") saveInlineAsset(r); }} /> : r.name}</TD>
              <TD>{isEditing ? <Input value={inlineRow[r.id]?.category ?? ""} onChange={(e) => setInlineRow((p) => ({ ...p, [r.id]: { ...p[r.id], category: e.target.value } }))} className="h-8 text-sm w-20" /> : (r.category ?? "—")}</TD>
              <TD>{formatDate(r.acquireDate)}</TD>
              <TD className="text-right">{formatMoney(r.acquireCost)}</TD>
              <TD className="text-right text-red-600">{formatMoney(r.accumulatedDepreciation)}</TD>
              <TD className="text-right font-medium">{formatMoney(r.bookValue)}</TD>
              <TD className="text-xs">{METHOD_LABELS[r.method] ?? r.method}</TD>
              <TD><Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status] ?? r.status}</Badge></TD>
              <TD className="text-xs text-gray-500">{r.updatedBy || "-"}</TD>
              {customCols.columns.map((cc) => { const ck = `${r.id}_${cc.id}`; const v = getCustomFieldValues("fixed-assets", r.id); const isE = editingCells[ck]; return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={v[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue("fixed-assets", r.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [ck]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="inline-block min-h-[24px] min-w-[40px] cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted" onClick={() => setEditingCells((p) => ({ ...p, [ck]: true }))}>{v[cc.id] || "—"}</span>}</TD>; })}
              <TD className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {isEditing ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => saveInlineAsset(r)} disabled={inlineSaving === r.id}>{inlineSaving === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-emerald-600" />}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setInlineRow((p) => { const n = { ...p }; delete n[r.id]; return n; })}><X className="h-4 w-4 text-gray-500" /></Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" title="行內編輯" onClick={() => setInlineRow((p) => ({ ...p, [r.id]: { code: r.code, name: r.name, category: r.category ?? "" } }))}><Pencil className="h-4 w-4" /></Button>
                      {r.status === "IN_USE" && (
                        <Button size="sm" variant="ghost" title="計提折舊一期" onClick={() => act(r.id, "depreciate")}>
                          <TrendingDown className="h-4 w-4 text-amber-600" />
                        </Button>
                      )}
                      {r.status !== "DISPOSED" && (
                        <Button size="sm" variant="ghost" title="處分" onClick={() => {
                          const amount = window.prompt("處分金額 (0 = 報廢)", "0");
                          if (amount !== null) act(r.id, "dispose", { disposeAmount: Number(amount) });
                        }}>
                          <Ban className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title="刪除" onClick={() => {
                        if (confirm("確定刪除？")) act(r.id, "delete");
                      }}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </>
                  )}
                </div>
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
      {openNew && <NewAssetDialog onClose={() => setOpenNew(false)} onCreated={() => { setOpenNew(false); load(); }} />}
      <CustomColumnDialog module="fixed-assets" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}

function NewAssetDialog({ onClose, onCreated }: any) {
  const [form, setForm] = useState({
    code: "", name: "", category: "設備", accountCode: "1421",
    acquireDate: new Date().toISOString().slice(0, 10),
    acquireCost: "", residualValue: "0", usefulLifeMonths: "60",
    method: "STRAIGHT_LINE", location: "", serialNumber: "", remark: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.code) return toast.error("請輸入資產編號");
    if (!form.name) return toast.error("請輸入資產名稱");
    if (!form.acquireCost || Number(form.acquireCost) <= 0) return toast.error("取得成本必須大於 0");
    setSaving(true);
    try {
      const res = await fetch("/api/accounting/fixed-assets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          acquireCost: Number(form.acquireCost),
          residualValue: Number(form.residualValue),
          usefulLifeMonths: Number(form.usefulLifeMonths),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "新增失敗");
      toast.success("已新增"); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>新增固定資產</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>資產編號 *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="FA-0001" /></div>
          <div className="space-y-1"><Label>資產名稱 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>分類</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="土地">土地</option>
              <option value="房屋及建築">房屋及建築</option>
              <option value="機器設備">機器設備</option>
              <option value="運輸設備">運輸設備</option>
              <option value="辦公設備">辦公設備</option>
              <option value="電腦設備">電腦設備</option>
              <option value="無形資產">無形資產</option>
              <option value="設備">其他設備</option>
            </select>
          </div>
          <div className="space-y-1"><Label>會計科目代碼</Label><Input value={form.accountCode} onChange={(e) => setForm({ ...form, accountCode: e.target.value })} placeholder="1421" /></div>
          <div className="space-y-1"><Label>取得日</Label><Input type="date" value={form.acquireDate} onChange={(e) => setForm({ ...form, acquireDate: e.target.value })} /></div>
          <div className="space-y-1"><Label>取得成本 *</Label><Input type="number" step="0.01" value={form.acquireCost} onChange={(e) => setForm({ ...form, acquireCost: e.target.value })} /></div>
          <div className="space-y-1"><Label>殘值</Label><Input type="number" step="0.01" value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: e.target.value })} /></div>
          <div className="space-y-1"><Label>耐用年限 (月)</Label><Input type="number" value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>折舊方法</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="STRAIGHT_LINE">直線法</option>
              <option value="DOUBLE_DECLINING">倍數遞減</option>
              <option value="NONE">不折舊（土地）</option>
            </select>
          </div>
          <div className="space-y-1"><Label>存放位置</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>序號</Label><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></div>
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
