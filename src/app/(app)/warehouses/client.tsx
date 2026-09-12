"use client";
import { useEffect, useState } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

function WarehouseDialog({ open, onClose, row, onSaved }: any) {
  const m = useTranslations("warehouses");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
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
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      toast.success(tc("saved"));
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
          <DialogTitle>{row ? m("edit") : m("create")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{f("code")} *</Label>
            <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{f("name")} *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{f("address")}</Label>
            <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            {f("active")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc("cancel")}</Button>
          <Button onClick={save}>{tc("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WarehouseClient() {
  const m = useTranslations("warehouses");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  return (
    <CrudTable
      endpoint="/api/warehouses"
      moduleKey="warehouses"
      FormDialog={WarehouseDialog}
      inlineEdit={true}
      columns={[
        { key: "code", title: f("code"), render: (r: any) => <span className="font-mono text-xs">{r.code}</span>, editable: { type: "text" } },
        { key: "name", title: f("name"), editable: { type: "text" } },
        { key: "address", title: f("address"), editable: { type: "text" } },
        { key: "isActive", title: tc("status"), render: (r: any) => (r.isActive ? <Badge variant="success">{f("active")}</Badge> : <Badge variant="danger">{f("inactive")}</Badge>) },
      ]}
    />
  );
}
