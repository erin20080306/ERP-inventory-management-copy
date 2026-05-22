"use client";
import { useEffect, useState } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "在職", PROBATION: "試用期", ON_LEAVE: "留停", RESIGNED: "離職", RETIRED: "退休",
};
const STATUS_VARIANTS: Record<string, any> = {
  ACTIVE: "success", PROBATION: "info", ON_LEAVE: "warning", RESIGNED: "danger", RETIRED: "secondary",
};

function EmployeeDialog({ open, onClose, row, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [depts, setDepts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/hr/departments?pageSize=1000").then((r) => r.json()).then((d) => setDepts(d.items ?? []));
    if (row) {
      setForm({
        ...row,
        birthDate: row.birthDate?.slice(0, 10) ?? "",
        hireDate: row.hireDate?.slice(0, 10) ?? "",
        resignDate: row.resignDate?.slice(0, 10) ?? "",
      });
    } else {
      setForm({
        employeeNo: "", name: "", status: "ACTIVE",
        hireDate: new Date().toISOString().slice(0, 10),
        baseSalary: 0, mealAllowance: 2400, transportAllowance: 0, positionAllowance: 0,
        insuredSalary: 0, laborPensionRate: 0.06, voluntaryPensionRate: 0, dependents: 0,
      });
    }
  }, [row, open]);

  async function save() {
    if (!form.employeeNo) return toast.error("請輸入員工編號");
    if (!form.name) return toast.error("請輸入姓名");
    if (!form.hireDate) return toast.error("請選擇到職日");
    setSaving(true);
    try {
      const res = await fetch(row ? `/api/hr/employees/${row.id}` : "/api/hr/employees", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存"); onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{row ? "編輯員工" : "新增員工"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* 基本資料 */}
          <div className="text-sm font-semibold border-l-2 border-primary pl-2">基本資料</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>員工編號 *</Label><Input value={form.employeeNo ?? ""} onChange={(e) => setForm({ ...form, employeeNo: e.target.value })} placeholder="EMP001" /></div>
            <div><Label>姓名 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>英文姓名</Label><Input value={form.englishName ?? ""} onChange={(e) => setForm({ ...form, englishName: e.target.value })} /></div>
            <div><Label>身分證字號</Label><Input value={form.idNumber ?? ""} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} /></div>
            <div>
              <Label>性別</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: e.target.value || null })}>
                <option value="">未設定</option>
                <option value="MALE">男</option>
                <option value="FEMALE">女</option>
                <option value="OTHER">其他</option>
              </select>
            </div>
            <div><Label>出生日期</Label><Input type="date" value={form.birthDate ?? ""} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></div>
            <div><Label>電話</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="col-span-2"><Label>地址</Label><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>緊急聯絡人</Label><Input value={form.emergencyContact ?? ""} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} /></div>
            <div><Label>緊急聯絡電話</Label><Input value={form.emergencyPhone ?? ""} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} /></div>
          </div>

          {/* 任職資訊 */}
          <div className="text-sm font-semibold border-l-2 border-primary pl-2 mt-4">任職資訊</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>部門</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.departmentId ?? ""} onChange={(e) => setForm({ ...form, departmentId: e.target.value || null })}>
                <option value="">未指定</option>
                {depts.map((d) => <option key={d.id} value={d.id}>{d.code} {d.name}</option>)}
              </select>
            </div>
            <div><Label>職稱</Label><Input value={form.position ?? ""} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
            <div><Label>到職日 *</Label><Input type="date" value={form.hireDate ?? ""} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} /></div>
            <div><Label>離職日</Label><Input type="date" value={form.resignDate ?? ""} onChange={(e) => setForm({ ...form, resignDate: e.target.value })} /></div>
            <div className="col-span-2">
              <Label>狀態</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status ?? "ACTIVE"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">在職</option>
                <option value="PROBATION">試用期</option>
                <option value="ON_LEAVE">留職停薪</option>
                <option value="RESIGNED">離職</option>
                <option value="RETIRED">退休</option>
              </select>
            </div>
          </div>

          {/* 薪資設定 */}
          <div className="text-sm font-semibold border-l-2 border-primary pl-2 mt-4">薪資設定</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>本薪</Label><Input type="number" step="1" value={form.baseSalary ?? 0} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} /></div>
            <div><Label>伙食津貼 (免稅 2400)</Label><Input type="number" step="1" value={form.mealAllowance ?? 2400} onChange={(e) => setForm({ ...form, mealAllowance: e.target.value })} /></div>
            <div><Label>交通津貼</Label><Input type="number" step="1" value={form.transportAllowance ?? 0} onChange={(e) => setForm({ ...form, transportAllowance: e.target.value })} /></div>
            <div><Label>職務加給</Label><Input type="number" step="1" value={form.positionAllowance ?? 0} onChange={(e) => setForm({ ...form, positionAllowance: e.target.value })} /></div>
            <div><Label>投保薪資</Label><Input type="number" step="1" value={form.insuredSalary ?? 0} onChange={(e) => setForm({ ...form, insuredSalary: e.target.value })} /></div>
            <div><Label>健保眷屬數 (0-3)</Label><Input type="number" min="0" max="3" value={form.dependents ?? 0} onChange={(e) => setForm({ ...form, dependents: e.target.value })} /></div>
            <div><Label>雇主勞退提繳率 (預設 0.06)</Label><Input type="number" step="0.01" value={form.laborPensionRate ?? 0.06} onChange={(e) => setForm({ ...form, laborPensionRate: e.target.value })} /></div>
            <div><Label>員工自願提繳率 (0-0.06)</Label><Input type="number" step="0.01" min="0" max="0.06" value={form.voluntaryPensionRate ?? 0} onChange={(e) => setForm({ ...form, voluntaryPensionRate: e.target.value })} /></div>
          </div>

          {/* 銀行/稅務 */}
          <div className="text-sm font-semibold border-l-2 border-primary pl-2 mt-4">銀行 / 稅務</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>銀行名稱</Label><Input value={form.bankName ?? ""} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
            <div><Label>銀行帳號</Label><Input value={form.bankAccountNo ?? ""} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} /></div>
            <div className="col-span-2"><Label>備註</Label><Input value={form.remark ?? ""} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeesClient() {
  return (
    <CrudTable<any>
      endpoint="/api/hr/employees"
      moduleKey="employees"
      searchPlaceholder="搜尋編號 / 姓名 / 電話"
      enableDateFilter={true}
      FormDialog={EmployeeDialog}
      pdfTitle="員工管理"
      exportName="employees"
      templateHeaders={["員工編號", "姓名", "身分證", "電話", "Email", "到職日", "本薪", "伙食津貼", "投保薪資", "眷屬數"]}
      importMap={(r) => ({
        employeeNo: String(r["員工編號"] ?? r.employeeNo ?? "").trim(),
        name: String(r["姓名"] ?? r.name ?? "").trim(),
        idNumber: String(r["身分證"] ?? r.idNumber ?? "").trim() || undefined,
        phone: String(r["電話"] ?? r.phone ?? "").trim() || undefined,
        email: String(r["Email"] ?? r.email ?? "").trim() || undefined,
        hireDate: r["到職日"] || new Date().toISOString().slice(0, 10),
        baseSalary: Number(r["本薪"] ?? 0),
        mealAllowance: Number(r["伙食津貼"] ?? 2400),
        insuredSalary: Number(r["投保薪資"] ?? r["本薪"] ?? 0),
        dependents: Number(r["眷屬數"] ?? 0),
      })}
      inlineEdit={true}
      columns={[
        { key: "employeeNo", title: "員工編號", render: (r: any) => <span className="font-mono text-xs">{r.employeeNo}</span>, editable: { type: "text" } },
        { key: "name", title: "姓名", editable: { type: "text" } },
        { key: "department", title: "部門", render: (r: any) => r.department?.name ?? "—" },
        { key: "position", title: "職稱", editable: { type: "text" } },
        { key: "phone", title: "電話", editable: { type: "text" } },
        { key: "baseSalary", title: "本薪", render: (r: any) => formatMoney(r.baseSalary), editable: { type: "number" } },
        { key: "hireDate", title: "到職日", render: (r: any) => r.hireDate?.slice(0, 10) ?? "—" },
        { key: "status", title: "狀態", csv: (r: any) => STATUS_LABELS[r.status] ?? r.status, render: (r: any) => <Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status] ?? r.status}</Badge> },
      ]}
    />
  );
}
