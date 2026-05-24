"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Loader2, FileSpreadsheet, Printer, Download } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = { DRAFT: "草稿", APPROVED: "已確認", POSTED: "已發放", VOIDED: "作廢" };
const STATUS_VARIANTS: Record<string, any> = { DRAFT: "info", APPROVED: "warning", POSTED: "success", VOIDED: "danger" };

export function PayrollSummaryClient() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());

  async function loadPeriods() {
    setLoading(true);
    const res = await fetch(`/api/hr/payroll-periods?year=${year}`);
    const d = await res.json();
    setPeriods(d.items ?? []);
    if (!selectedPeriod && d.items?.[0]) setSelectedPeriod(d.items[0]);
    setLoading(false);
  }

  useEffect(() => { loadPeriods(); }, [year]);

  async function loadPayrolls() {
    if (!selectedPeriod) return;
    setLoading(true);
    const res = await fetch(`/api/hr/payrolls?periodId=${selectedPeriod.id}&pageSize=1000`);
    const d = await res.json();
    setPayrolls(d.items ?? []);
    setLoading(false);
  }

  useEffect(() => { loadPayrolls(); }, [selectedPeriod?.id]);

  async function exportSummary() {
    if (!selectedPeriod) return;
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel(
      `payroll-summary-${selectedPeriod.year}${String(selectedPeriod.month).padStart(2, "0")}`,
      "每月薪資發放明細總表",
      payrolls,
      [
        { key: "number", title: "單號" },
        { key: "employeeNo", title: "員工編號", get: (r: any) => r.employee.employeeNo },
        { key: "name", title: "姓名", get: (r: any) => r.employee.name },
        { key: "department", title: "部門", get: (r: any) => r.employee.department?.name ?? "" },
        { key: "position", title: "職稱", get: (r: any) => r.employee.position ?? "" },
        { key: "workDays", title: "工作天數", get: (r: any) => Number(r.workDays) },
        { key: "overtimeHours", title: "加班時數", get: (r: any) => Number(r.overtimeHours) },
        { key: "earnings", title: "應發合計", get: (r: any) => Number(r.earnings) },
        { key: "deductions", title: "應扣合計", get: (r: any) => Number(r.deductions) },
        { key: "netPay", title: "實領金額", get: (r: any) => Number(r.netPay) },
        { key: "employerCost", title: "雇主負擔", get: (r: any) => Number(r.employerCost) },
        { key: "status", title: "狀態", get: (r: any) => STATUS_LABELS[r.status] ?? r.status },
        { key: "paidAt", title: "發放日期", get: (r: any) => r.paidAt ? formatDate(r.paidAt) : "" },
      ]
    );
    toast.success("已匯出 Excel");
  }

  const summary = {
    totalEmployees: payrolls.length,
    totalEarnings: payrolls.reduce((s, p) => s + Number(p.earnings), 0),
    totalDeductions: payrolls.reduce((s, p) => s + Number(p.deductions), 0),
    totalNetPay: payrolls.reduce((s, p) => s + Number(p.netPay), 0),
    totalEmployerCost: payrolls.reduce((s, p) => s + Number(p.employerCost), 0),
    totalWorkDays: payrolls.reduce((s, p) => s + Number(p.workDays), 0),
    totalOvertimeHours: payrolls.reduce((s, p) => s + Number(p.overtimeHours), 0),
  };

  return (
    <div className="space-y-4">
      {/* 年份選擇 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">選擇年份</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Label>年份：</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-32"
            />
            <Button onClick={loadPeriods} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "查詢"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 期間選擇 */}
      {periods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">選擇月份</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {periods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPeriod(p)}
                  className={`px-3 py-2 rounded-md border text-sm ${
                    selectedPeriod?.id === p.id
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-input"
                  }`}
                >
                  {p.year}/{String(p.month).padStart(2, "0")}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({p._count?.payrolls ?? 0}人)
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedPeriod && (
        <>
          {/* 統計摘要 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">員工數</div>
                <div className="text-xl font-bold">{summary.totalEmployees}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">應發合計</div>
                <div className="text-xl font-bold">{formatMoney(summary.totalEarnings)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">應扣合計</div>
                <div className="text-xl font-bold text-red-600">
                  {formatMoney(summary.totalDeductions)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">實領合計</div>
                <div className="text-xl font-bold text-emerald-600">
                  {formatMoney(summary.totalNetPay)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">雇主負擔</div>
                <div className="text-xl font-bold text-amber-600">
                  {formatMoney(summary.totalEmployerCost)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">總工作天數</div>
                <div className="text-xl font-bold">{summary.totalWorkDays}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">總加班時數</div>
                <div className="text-xl font-bold">{summary.totalOvertimeHours}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">平均實領</div>
                <div className="text-xl font-bold">
                  {summary.totalEmployees > 0
                    ? formatMoney(summary.totalNetPay / summary.totalEmployees)
                    : "0"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 操作列 */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">
                {selectedPeriod.year}/{String(selectedPeriod.month).padStart(2, "0")}
              </span>
              <Badge variant={STATUS_VARIANTS[selectedPeriod.status]}>
                {STATUS_LABELS[selectedPeriod.status]}
              </Badge>
              {selectedPeriod.payDate && (
                <span className="text-muted-foreground">
                  發薪日：{formatDate(selectedPeriod.payDate)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={exportSummary}>
                <FileSpreadsheet className="h-4 w-4" />匯出 Excel
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />列印
              </Button>
            </div>
          </div>

          {/* 薪資發放明細表 */}
          <Table>
            <THead>
              <TR>
                <TH>單號</TH>
                <TH>員工編號</TH>
                <TH>姓名</TH>
                <TH>部門</TH>
                <TH>職稱</TH>
                <TH className="text-right">工作天數</TH>
                <TH className="text-right">加班時數</TH>
                <TH className="text-right">應發合計</TH>
                <TH className="text-right">應扣合計</TH>
                <TH className="text-right">實領金額</TH>
                <TH className="text-right">雇主負擔</TH>
                <TH>狀態</TH>
                <TH>發放日期</TH>
              </TR>
            </THead>
            <TBody>
              {loading && (
                <TR>
                  <TD colSpan={13} className="text-center py-10">
                    <Loader2 className="inline h-5 w-5 animate-spin" />
                  </TD>
                </TR>
              )}
              {!loading && payrolls.length === 0 && (
                <TR>
                  <TD colSpan={13}>
                    <EmptyState />
                  </TD>
                </TR>
              )}
              {!loading &&
                payrolls.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.number}</TD>
                    <TD>{p.employee.employeeNo}</TD>
                    <TD>{p.employee.name}</TD>
                    <TD className="text-muted-foreground text-xs">
                      {p.employee.department?.name ?? "—"}
                    </TD>
                    <TD className="text-muted-foreground text-xs">
                      {p.employee.position ?? "—"}
                    </TD>
                    <TD className="text-right">{Number(p.workDays)}</TD>
                    <TD className="text-right">{Number(p.overtimeHours)}</TD>
                    <TD className="text-right">{formatMoney(p.earnings)}</TD>
                    <TD className="text-right text-red-600">
                      {formatMoney(p.deductions)}
                    </TD>
                    <TD className="text-right font-bold">{formatMoney(p.netPay)}</TD>
                    <TD className="text-right text-amber-600">
                      {formatMoney(p.employerCost)}
                    </TD>
                    <TD>
                      <Badge variant={STATUS_VARIANTS[p.status]}>
                        {STATUS_LABELS[p.status]}
                      </Badge>
                    </TD>
                    <TD className="text-muted-foreground text-xs">
                      {p.paidAt ? formatDate(p.paidAt) : "—"}
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </>
      )}
    </div>
  );
}
