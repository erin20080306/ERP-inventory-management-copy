"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Loader2, Calculator, FileSpreadsheet, Printer, Eye, CheckCircle2, DollarSign, Ban, BookOpen } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/utils";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";
import { TableHint, useColumnDrag } from "@/components/table-helpers";

const STATUS_LABELS: Record<string, string> = { DRAFT: "草稿", APPROVED: "已確認", POSTED: "已發放", VOIDED: "作廢" };
const STATUS_VARIANTS: Record<string, any> = { DRAFT: "info", APPROVED: "warning", POSTED: "success", VOIDED: "danger" };

export function PayrollClient() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [viewPayroll, setViewPayroll] = useState<any>(null);
  const customCols = useCustomColumns("payroll");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const colDrag = useColumnDrag("payroll", ["number", "employee", "dept", "earnings", "deductions", "netPay", "employerCost", "status"]);

  async function loadPeriods() {
    const res = await fetch("/api/hr/payroll-periods");
    const d = await res.json();
    setPeriods(d.items ?? []);
    if (!selectedPeriod && d.items?.[0]) setSelectedPeriod(d.items[0]);
  }
  useEffect(() => { loadPeriods(); /* eslint-disable-next-line */ }, []);

  async function loadPayrolls() {
    if (!selectedPeriod) return;
    setLoading(true);
    const res = await fetch(`/api/hr/payrolls?periodId=${selectedPeriod.id}&pageSize=1000`);
    const d = await res.json();
    setPayrolls(d.items ?? []);
    setLoading(false);
  }
  useEffect(() => { loadPayrolls(); /* eslint-disable-next-line */ }, [selectedPeriod?.id]);

  async function generate() {
    if (!selectedPeriod) return;
    if (!confirm(`為 ${selectedPeriod.year}/${selectedPeriod.month} 所有在職員工自動產生薪資草稿？`)) return;
    try {
      const res = await fetch(`/api/hr/payroll-periods/${selectedPeriod.id}/generate`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      const r = await res.json();
      toast.success(`已建立 ${r.created} 筆 (略過 ${r.skipped})`);
      loadPayrolls();
    } catch (e: any) { toast.error(e.message); }
  }

  async function act(id: string, action: string) {
    try {
      const res = await fetch(`/api/hr/payrolls/${id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      toast.success("已處理"); loadPayrolls();
    } catch (e: any) { toast.error(e.message); }
  }

  async function exportPayrolls() {
    if (!selectedPeriod) return;
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel(`payroll-${selectedPeriod.year}${String(selectedPeriod.month).padStart(2, "0")}`, "薪資清冊", payrolls, [
      { key: "number", title: "單號" },
      { key: "employee", title: "員工編號", get: (r: any) => r.employee.employeeNo },
      { key: "name", title: "姓名", get: (r: any) => r.employee.name },
      { key: "dept", title: "部門", get: (r: any) => r.employee.department?.name ?? "" },
      { key: "earnings", title: "應發合計", get: (r: any) => Number(r.earnings) },
      { key: "deductions", title: "應扣合計", get: (r: any) => Number(r.deductions) },
      { key: "netPay", title: "實領金額", get: (r: any) => Number(r.netPay) },
      { key: "employerCost", title: "雇主負擔", get: (r: any) => Number(r.employerCost) },
      { key: "status", title: "狀態", get: (r: any) => STATUS_LABELS[r.status] ?? r.status },
    ]);
    toast.success("已匯出 Excel");
  }

  const summary = {
    earnings: payrolls.reduce((s, p) => s + Number(p.earnings), 0),
    deductions: payrolls.reduce((s, p) => s + Number(p.deductions), 0),
    netPay: payrolls.reduce((s, p) => s + Number(p.netPay), 0),
    employerCost: payrolls.reduce((s, p) => s + Number(p.employerCost), 0),
  };

  return (
    <div className="space-y-4">
      {/* 期間切換 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>結算期間</span>
            <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" />新增期間</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {periods.length === 0 && <p className="text-sm text-muted-foreground">尚無期間，請先新增</p>}
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPeriod(p)}
                className={`px-3 py-2 rounded-md border text-sm ${selectedPeriod?.id === p.id ? "border-primary bg-primary/10 font-medium" : "border-input"}`}
              >
                {p.year}/{String(p.month).padStart(2, "0")}
                <span className="ml-2 text-xs text-muted-foreground">({p._count?.payrolls ?? 0})</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedPeriod && (
        <>
          {/* 摘要 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">應發合計</div><div className="text-xl font-bold">{formatMoney(summary.earnings)}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">應扣合計</div><div className="text-xl font-bold text-red-600">{formatMoney(summary.deductions)}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">實領合計</div><div className="text-xl font-bold text-emerald-600">{formatMoney(summary.netPay)}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">雇主負擔</div><div className="text-xl font-bold text-amber-600">{formatMoney(summary.employerCost)}</div></CardContent></Card>
          </div>

          {/* 操作列 */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{selectedPeriod.year}/{String(selectedPeriod.month).padStart(2, "0")}</span>
              <Badge variant={STATUS_VARIANTS[selectedPeriod.status]}>{STATUS_LABELS[selectedPeriod.status]}</Badge>
              {selectedPeriod.payDate && <span className="text-muted-foreground">發薪日：{formatDate(selectedPeriod.payDate)}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={generate}><Calculator className="h-4 w-4" />自動產生薪資</Button>
              <Button variant="outline" onClick={exportPayrolls}><FileSpreadsheet className="h-4 w-4" />匯出 Excel</Button>
              <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />列印清冊</Button>
              <Button variant="outline" onClick={async () => {
                try {
                  const res = await fetch("/api/accounting/journals/from-source", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sourceType: "PAYROLL_PERIOD", sourceId: selectedPeriod.id }),
                  });
                  if (!res.ok) throw new Error((await res.json()).error || "生成草稿失敗");
                  const draft = await res.json();
                  sessionStorage.setItem("journal_draft", JSON.stringify(draft));
                  window.location.href = "/accounting/journals?fromSource=1";
                } catch (e: any) { toast.error(e.message); }
              }}><BookOpen className="h-4 w-4" />轉傳票</Button>
              <CustomColumnButton onClick={() => customCols.setOpen(true)} />
            </div>
          </div>

          <TableHint />

          {/* 薪資清冊 */}
          <Table>
            <THead>
              <TR>
                <TH {...colDrag.thProps("number")}>單號</TH><TH {...colDrag.thProps("employee")}>員工</TH><TH {...colDrag.thProps("dept")}>部門</TH>
                <TH {...colDrag.thProps("earnings")} className="text-right">應發</TH>
                <TH {...colDrag.thProps("deductions")} className="text-right">應扣</TH>
                <TH {...colDrag.thProps("netPay")} className="text-right">實領</TH>
                <TH {...colDrag.thProps("employerCost")} className="text-right">雇主負擔</TH>
                <TH {...colDrag.thProps("status")}>狀態</TH>
                {customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}
                <TH className="text-right w-40">操作</TH>
              </TR>
            </THead>
            <TBody>
              {loading && <TR><TD colSpan={9} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
              {!loading && payrolls.length === 0 && <TR><TD colSpan={9}><EmptyState /></TD></TR>}
              {!loading && payrolls.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.number}</TD>
                  <TD>{p.employee.employeeNo} {p.employee.name}</TD>
                  <TD className="text-muted-foreground text-xs">{p.employee.department?.name ?? "—"}</TD>
                  <TD className="text-right">{formatMoney(p.earnings)}</TD>
                  <TD className="text-right text-red-600">{formatMoney(p.deductions)}</TD>
                  <TD className="text-right font-bold">{formatMoney(p.netPay)}</TD>
                  <TD className="text-right text-amber-600">{formatMoney(p.employerCost)}</TD>
                  <TD><Badge variant={STATUS_VARIANTS[p.status]}>{STATUS_LABELS[p.status]}</Badge></TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" title="檢視" onClick={() => setViewPayroll(p)}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="列印薪資單" onClick={() => window.open(`/print/payroll/${p.id}`, "_blank")}><Printer className="h-4 w-4" /></Button>
                      {p.status === "DRAFT" && <Button size="sm" variant="ghost" title="確認" onClick={() => act(p.id, "confirm")}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>}
                      {p.status === "APPROVED" && <Button size="sm" variant="ghost" title="發放" onClick={() => act(p.id, "pay")}><DollarSign className="h-4 w-4 text-emerald-600" /></Button>}
                      {p.status !== "VOIDED" && p.status !== "POSTED" && <Button size="sm" variant="ghost" title="作廢" onClick={() => act(p.id, "void")}><Ban className="h-4 w-4 text-red-600" /></Button>}
                    </div>
                  </TD>
                  {customCols.columns.map((cc) => {
                    const cellKey = `${p.id}_${cc.id}`;
                    const vals = getCustomFieldValues("payroll", p.id);
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
                              setCustomFieldValue("payroll", p.id, cc.id, e.target.value);
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
        </>
      )}

      {openNew && <NewPeriodDialog onClose={() => setOpenNew(false)} onCreated={() => { setOpenNew(false); loadPeriods(); }} />}
      {viewPayroll && <PayrollDetailDialog id={viewPayroll.id} onClose={() => setViewPayroll(null)} onChanged={loadPayrolls} />}
      <CustomColumnDialog module="payroll" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}

function NewPeriodDialog({ onClose, onCreated }: any) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payDate, setPayDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/hr/payroll-periods", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, payDate: payDate || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "失敗");
      toast.success("已新增"); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>新增結算期間</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>年</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
          <div><Label>月</Label><Input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(Number(e.target.value))} /></div>
          <div className="col-span-2"><Label>發薪日</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "建立"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayrollDetailDialog({ id, onClose, onChanged }: any) {
  const [data, setData] = useState<any>(null);
  const [extra, setExtra] = useState({ overtimePay: 0, bonus: 0, leaveDeduction: 0, otherDeductions: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/hr/payrolls/${id}`).then((r) => r.json()).then((d) => {
      setData(d);
      const get = (code: string) => Number(d.items.find((i: any) => i.code === code)?.amount ?? 0);
      setExtra({ overtimePay: get("OT"), bonus: get("BONUS"), leaveDeduction: get("LEAVE_DEDUCT"), otherDeductions: get("OTHER_DEDUCT") });
    });
  }, [id]);

  async function recompute() {
    setSaving(true);
    try {
      const res = await fetch(`/api/hr/payrolls/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extra),
      });
      if (!res.ok) throw new Error((await res.json()).error || "失敗");
      const updated = await res.json();
      setData(updated);
      toast.success("已重新計算");
      onChanged?.();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (!data) return null;
  const earnings = data.items.filter((i: any) => i.type === "EARNING");
  const deductions = data.items.filter((i: any) => i.type === "DEDUCTION");
  const employer = data.items.filter((i: any) => i.type === "EMPLOYER");

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            薪資單 {data.number} - {data.employee.name}
            <Badge className="ml-2" variant={STATUS_VARIANTS[data.status]}>{STATUS_LABELS[data.status]}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>結算期間：{data.period.year}/{String(data.period.month).padStart(2, "0")}</div>
          <div>員工：{data.employee.employeeNo} {data.employee.name}</div>
          <div>部門：{data.employee.department?.name ?? "—"}</div>
          <div>職稱：{data.employee.position ?? "—"}</div>
        </div>

        {/* 可調整項目 */}
        {data.status === "DRAFT" && (
          <div className="space-y-2 mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded">
            <div className="text-sm font-semibold">調整項目（重新計算後存檔）</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>加班費</Label><Input type="number" value={extra.overtimePay} onChange={(e) => setExtra({ ...extra, overtimePay: Number(e.target.value) })} /></div>
              <div><Label>獎金</Label><Input type="number" value={extra.bonus} onChange={(e) => setExtra({ ...extra, bonus: Number(e.target.value) })} /></div>
              <div><Label>請假扣款</Label><Input type="number" value={extra.leaveDeduction} onChange={(e) => setExtra({ ...extra, leaveDeduction: Number(e.target.value) })} /></div>
              <div><Label>其他扣款</Label><Input type="number" value={extra.otherDeductions} onChange={(e) => setExtra({ ...extra, otherDeductions: Number(e.target.value) })} /></div>
            </div>
            <Button size="sm" onClick={recompute} disabled={saving}>{saving ? "計算中..." : "重新計算並儲存"}</Button>
          </div>
        )}

        {/* 明細表 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div className="border rounded p-3">
            <div className="font-semibold mb-2 text-emerald-700">應發項目</div>
            {earnings.map((i: any) => (
              <div key={i.id} className="flex justify-between text-sm py-1">
                <span>{i.name}</span><span className="font-mono">{formatMoney(i.amount)}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
              <span>合計</span><span>{formatMoney(data.earnings)}</span>
            </div>
          </div>
          <div className="border rounded p-3">
            <div className="font-semibold mb-2 text-red-700">應扣項目</div>
            {deductions.map((i: any) => (
              <div key={i.id} className="flex justify-between text-sm py-1">
                <span>{i.name}</span><span className="font-mono">{formatMoney(i.amount)}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
              <span>合計</span><span>{formatMoney(data.deductions)}</span>
            </div>
          </div>
          <div className="border rounded p-3">
            <div className="font-semibold mb-2 text-amber-700">雇主負擔</div>
            {employer.map((i: any) => (
              <div key={i.id} className="flex justify-between text-sm py-1">
                <span>{i.name}</span><span className="font-mono">{formatMoney(i.amount)}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
              <span>合計</span><span>{formatMoney(data.employerCost)}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-primary/10 rounded flex items-center justify-between">
          <span className="text-lg font-semibold">實領淨額</span>
          <span className="text-2xl font-bold text-primary">{formatMoney(data.netPay)}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => window.open(`/print/payroll/${data.id}`, "_blank")}>
            <Printer className="h-4 w-4" />列印薪資單
          </Button>
          <Button variant="ghost" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
