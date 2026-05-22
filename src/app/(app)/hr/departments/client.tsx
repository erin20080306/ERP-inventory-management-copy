"use client";
import { useEffect, useState } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

function DepartmentDialog({ open, onClose, row, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [parents, setParents] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/hr/departments?pageSize=1000").then((r) => r.json()).then((d) => setParents(d.items ?? []));
    setForm(row ?? { code: "", name: "", isActive: true });
  }, [row, open]);

  async function save() {
    if (!form.code || !form.name) return toast.error("請輸入編號與名稱");
    setSaving(true);
    try {
      const res = await fetch(row ? `/api/hr/departments/${row.id}` : "/api/hr/departments", {
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
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "編輯部門" : "新增部門"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>編號 *</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><Label>名稱 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="col-span-2">
            <Label>上層部門</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.parentId ?? ""} onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}>
              <option value="">無</option>
              {parents.filter((p) => p.id !== row?.id).map((p) => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
            </select>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            啟用
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentsClient() {
  return (
    <CrudTable<any>
      endpoint="/api/hr/departments"
      moduleKey="departments"
      searchPlaceholder="搜尋編號 / 名稱"
      enableDateFilter={true}
      FormDialog={DepartmentDialog}
      exportName="departments"
      pdfTitle="部門管理"
      columns={[
        { key: "code", title: "編號", render: (r: any) => <span className="font-mono text-xs">{r.code}</span> },
        { key: "name", title: "名稱" },
        { key: "isActive", title: "狀態", csv: (r: any) => (r.isActive ? "啟用" : "停用"), render: (r: any) => (r.isActive ? <Badge variant="success">啟用</Badge> : <Badge variant="danger">停用</Badge>) },
      ]}
    />
  );
}
