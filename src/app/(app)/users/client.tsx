"use client";
import { useEffect, useState } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";

function UserDialog({ open, onClose, row, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [allRoles, setAllRoles] = useState<any[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/roles").then((r) => r.json()).then((d) => setAllRoles(d.roles ?? []));
    setForm(
      row
        ? { ...row, password: "", roleIds: row.roles?.map((r: any) => r.id) ?? [] }
        : { username: "", name: "", email: "", password: "", isActive: true, roleIds: [] }
    );
  }, [row, open]);

  async function save() {
    try {
      const res = await fetch(row ? `/api/users/${row.id}` : "/api/users", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e.message); }
  }

  function toggleRole(id: string) {
    const set = new Set(form.roleIds ?? []);
    set.has(id) ? set.delete(id) : set.add(id);
    setForm({ ...form, roleIds: Array.from(set) });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{row ? "編輯使用者" : "新增使用者"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>帳號 *</Label><Input disabled={!!row} value={form.username ?? ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div className="space-y-1"><Label>姓名 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1 col-span-2">
            <Label>{row ? "新密碼（留空不變更）" : "密碼 *"}</Label>
            <Input type="password" value={form.password ?? ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>角色</Label>
            <div className="border rounded-md p-3 grid grid-cols-2 gap-2">
              {allRoles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={(form.roleIds ?? []).includes(r.id)} onChange={() => toggleRole(r.id)} />
                  {r.name}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />啟用</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={save}>儲存</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserClient() {
  return (
    <CrudTable
      endpoint="/api/users"
      searchPlaceholder="搜尋 帳號 / 姓名 / Email"
      FormDialog={UserDialog}
      columns={[
        { key: "username", title: "帳號", render: (r: any) => <span className="font-mono text-xs">{r.username}</span> },
        { key: "name", title: "姓名" },
        { key: "email", title: "Email" },
        { key: "roles", title: "角色", render: (r: any) => (
          <div className="flex flex-wrap gap-1">
            {(r.roles ?? []).map((ro: any) => <Badge key={ro.id} variant="info">{ro.name}</Badge>)}
          </div>
        )},
        { key: "lastLoginAt", title: "上次登入", render: (r: any) => r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "—" },
        { key: "isActive", title: "狀態", render: (r: any) => (r.isActive ? <Badge variant="success">啟用</Badge> : <Badge variant="danger">停用</Badge>) },
      ]}
    />
  );
}
