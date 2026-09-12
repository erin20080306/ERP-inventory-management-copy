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
import { Plus, Loader2, Calculator, FileSpreadsheet, Printer, Eye, CheckCircle2, DollarSign, Ban, BookOpen, Edit } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/utils";
import { useCustomColumns, useCustomFieldValues, CustomColumnDialog, CustomColumnButton, CustomFieldGridCell } from "@/components/custom-columns";
import { TableHint, useColumnDrag } from "@/components/table-helpers";
import { useTranslations } from "next-intl";

// 值是 fields 命名空間的鍵；資料庫存的仍是 DRAFT／POSTED 等代碼。
const STATUS_LABEL_KEYS: Record<string, string> = { DRAFT: "draft", APPROVED: "payrollApproved", POSTED: "payrollPosted", VOIDED: "voided" };
const STATUS_VARIANTS: Record<string, any> = { DRAFT: "info", APPROVED: "warning", POSTED: "success", VOIDED: "danger" };

export function PayrollClient() {
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [viewPayroll, setViewPayroll] = useState<any>(null);
  const customCols = useCustomColumns("payroll");
  const customFieldValues = useCustomFieldValues("payroll", payrolls.map((row) => row.id));
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
      if (!res.ok) throw new Error((await res.json()).error || f("actionFailed"));
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
      if (!res.ok) throw new Error((await res.json()).error || f("actionFailed"));
      toast.success(f("settled")); loadPayrolls();
    } catch (e: any) { toast.error(e.message); }
  }

  async function exportPayrolls() {
    if (!selectedPeriod) return;
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel(`payroll-${selectedPeriod.year}${String(selectedPeriod.month).padStart(2, "0")}`, "薪資清冊", payrolls, [
      { key: "number", title: f("docNo") },
      { key: "employee", title: f("employeeNo"), get: (r: any) => r.employee.employeeNo },
      { key: "name", title: f("fullName"), get: (r: any) => r.employee.name },
      { key: "dept", title: f("department"), get: (r: any) => r.employee.department?.name ?? "" },
      { key: "earnings", title: f("grossPay"), get: (r: any) => Number(r.earnings) },
      { key: "deductions", title: f("totalDeductions"), get: (r: any) => Number(r.deductions) },
      { key: "netPay", title: "實領金額", get: (r: any) => Number(r.netPay) },
      { key: "employerCost", title: f("employerCost"), get: (r: any) => Number(r.employerCost) },
      { key: "status", title: tc("status"), get: (r: any) => f(STATUS_LABEL_KEYS[r.status]) ?? r.status },
    ]);
    toast.success(tt("exportedExcel"));
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
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{f("grossPay")}</div><div className="text-xl font-bold">{formatMoney(summary.earnings)}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{f("totalDeductions")}</div><div className="text-xl font-bold text-red-600">{formatMoney(summary.deductions)}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">實領合計</div><div className="text-xl font-bold text-emerald-600">{formatMoney(summary.netPay)}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{f("employerCost")}</div><div className="text-xl font-bold text-amber-600">{formatMoney(summary.employerCost)}</div></CardContent></Card>
          </div>

          {/* 操作列 */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{selectedPeriod.year}/{String(selectedPeriod.month).padStart(2, "0")}</span>
              <Badge variant={STATUS_VARIANTS[selectedPeriod.status]}>{f(STATUS_LABEL_KEYS[selectedPeriod.status])}</Badge>
              {selectedPeriod.periodStart && selectedPeriod.periodEnd && (
                <span className="text-muted-foreground">
                  期間：{formatDate(selectedPeriod.periodStart)} ~ {formatDate(selectedPeriod.periodEnd)}
                </span>
              )}
              {selectedPeriod.payDate && <span className="text-muted-foreground">發薪日：{formatDate(selectedPeriod.payDate)}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={generate}><Calculator className="h-4 w-4" />自動產生薪資</Button>
              <Button variant="outline" onClick={exportPayrolls}><FileSpreadsheet className="h-4 w-4" />{tt("exportExcel")}</Button>
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
            <THead onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("manageCustomColumns")}>
              <TR>
                <TH {...colDrag.thProps("number")}>{f("docNo")}</TH><TH {...colDrag.thProps("employee")}>員工</TH><TH {...colDrag.thProps("dept")}>{f("department")}</TH>
                <TH {...colDrag.thProps("earnings")} className="text-right">應發</TH>
                <TH {...colDrag.thProps("deductions")} className="text-right">應扣</TH>
                <TH {...colDrag.thProps("netPay")} className="text-right">實領</TH>
                <TH {...colDrag.thProps("employerCost")} className="text-right">{f("employerCost")}</TH>
                <TH {...colDrag.thProps("status")}>{tc("status")}</TH>
                {customCols.columns.map((cc) => <TH key={cc.id} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("rightClickColumns")}>{cc.label}</TH>)}
                <TH className="text-right w-40">{tc("actions")}</TH>
              </TR>
            </THead>
            <TBody>
              {loading && <TR><TD colSpan={9} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
              {!loading && payrolls.length === 0 && <TR><TD colSpan={9}><EmptyState /></TD></TR>}
              {!loading && payrolls.map((p, rowIndex) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.number}</TD>
                  <TD>{p.employee.employeeNo} {p.employee.name}</TD>
                  <TD className="text-muted-foreground text-xs">{p.employee.department?.name ?? "—"}</TD>
                  <TD className="text-right">{formatMoney(p.earnings)}</TD>
                  <TD className="text-right text-red-600">{formatMoney(p.deductions)}</TD>
                  <TD className="text-right font-bold">{formatMoney(p.netPay)}</TD>
                  <TD className="text-right text-amber-600">{formatMoney(p.employerCost)}</TD>
                  <TD><Badge variant={STATUS_VARIANTS[p.status]}>{f(STATUS_LABEL_KEYS[p.status])}</Badge></TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" title={tc("edit")} onClick={() => setViewPayroll(p)}><Edit className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="檢視" onClick={() => setViewPayroll(p)}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="列印薪資單" onClick={() => window.open(`/print/payroll/${p.id}`, "_blank")}><Printer className="h-4 w-4" /></Button>
                      {p.status === "DRAFT" && <Button size="sm" variant="ghost" title={tc("confirm")} onClick={() => act(p.id, "confirm")}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>}
                      {p.status === "APPROVED" && <Button size="sm" variant="ghost" title="發放" onClick={() => act(p.id, "pay")}><DollarSign className="h-4 w-4 text-emerald-600" /></Button>}
                      {p.status !== "VOIDED" && p.status !== "POSTED" && <Button size="sm" variant="ghost" title={tc("void")} onClick={() => act(p.id, "void")}><Ban className="h-4 w-4 text-red-600" /></Button>}
                    </div>
                  </TD>
                  {customCols.columns.map((cc, columnIndex) => { const vals = customFieldValues.getValues(p.id); return <TD key={cc.id}><CustomFieldGridCell gridId="payroll" rowId={p.id} rowIndex={rowIndex} column={cc} columnIndex={columnIndex} rowIds={payrolls.map((row) => row.id)} columns={customCols.columns} value={vals[cc.id] ?? ""} saveValues={customFieldValues.saveValues} onManageColumns={() => customCols.setOpen(true)} /></TD>; })}
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
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [payDate, setPayDate] = useState("");
  const [saving, setSaving] = useState(false);

  // 當年月變化時，自動計算預設的開始和結束日期
  useEffect(() => {
    if (year && month) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    }
  }, [year, month]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/hr/payroll-periods", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          year, 
          month, 
          periodStart: startDate || undefined, 
          periodEnd: endDate || undefined,
          payDate: payDate || undefined 
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || f("failed"));
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
          <div><Label>開始日期</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div><Label>結束日期</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div className="col-span-2"><Label>發薪日</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc("cancel")}</Button>
          <Button onClick={save} disabled={saving}>{saving ? tc("saving") : "建立"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayrollDetailDialog({ id, onClose, onChanged }: any) {
  const f = useTranslations("fields");
  const tc = useTranslations("common");
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
      if (!res.ok) throw new Error((await res.json()).error || f("failed"));
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
            <Badge className="ml-2" variant={STATUS_VARIANTS[data.status]}>{f(STATUS_LABEL_KEYS[data.status])}</Badge>
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
              <span>{tc("total")}</span><span>{formatMoney(data.earnings)}</span>
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
              <span>{tc("total")}</span><span>{formatMoney(data.deductions)}</span>
            </div>
          </div>
          <div className="border rounded p-3">
            <div className="font-semibold mb-2 text-amber-700">{f("employerCost")}</div>
            {employer.map((i: any) => (
              <div key={i.id} className="flex justify-between text-sm py-1">
                <span>{i.name}</span><span className="font-mono">{formatMoney(i.amount)}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
              <span>{tc("total")}</span><span>{formatMoney(data.employerCost)}</span>
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
          <Button variant="ghost" onClick={onClose}>{tc("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
