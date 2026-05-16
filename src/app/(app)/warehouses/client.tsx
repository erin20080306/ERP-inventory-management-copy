"use client";
import { useEffect, useState } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

function WarehouseDialog({ open, onClose, row, onSaved }: any) {
  const [form, setForm] = useState<any>({ code: "", name: "", address: "", isActive: true });
  useEffect(() => {
    setForm(row ?? { code: "", name: "", address: "", isActive: true });
  }, [row, open]);

  async function save() {
    try {
      const res = await fetch(row ? `/api/warehouses/${row.id}` : "/api/warehouses", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "編輯倉庫" : "新增倉庫"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>編號 *</Label>
            <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>名稱 *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>地址</Label>
            <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            啟用
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WarehouseClient() {
  return (
    <CrudTable
      endpoint="/api/warehouses"
      FormDialog={WarehouseDialog}
      columns={[
        { key: "code", title: "編號", render: (r: any) => <span className="font-mono text-xs">{r.code}</span> },
        { key: "name", title: "名稱" },
        { key: "address", title: "地址" },
        { key: "isActive", title: "狀態", render: (r: any) => (r.isActive ? <Badge variant="success">啟用</Badge> : <Badge variant="danger">停用</Badge>) },
      ]}
    />
  );
}
