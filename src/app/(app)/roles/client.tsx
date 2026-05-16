"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { MODULE_LABELS, ACTION_LABELS } from "@/lib/permissions";

export function RolesClient() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/roles");
    const d = await res.json();
    setRoles(d.roles ?? []);
    setPermissions(d.permissions ?? []);
  }
  useEffect(() => { load(); }, []);

  async function onDelete(r: any) {
    if (!confirm("確定刪除？")) return;
    const res = await fetch(`/api/roles/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error((await res.json()).error || "刪除失敗");
    toast.success("已刪除");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" />新增角色</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {roles.length === 0 && <EmptyState />}
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>{r.name}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                {!r.isSystem && (
                  <Button variant="ghost" size="icon" onClick={() => onDelete(r)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">共 {r.permissions.length} 項權限</div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {r.permissions.slice(0, 15).map((rp: any) => {
                  const p = permissions.find((x) => x.id === rp.permissionId);
                  if (!p) return null;
                  const label = `${(MODULE_LABELS as any)[p.module] ?? p.module}·${(ACTION_LABELS as any)[p.action] ?? p.action}`;
                  return <Badge key={rp.permissionId} variant="outline">{label}</Badge>;
                })}
                {r.permissions.length > 15 && <Badge>+{r.permissions.length - 15}</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <RoleDialog open={open} onClose={() => setOpen(false)} role={editing} permissions={permissions} onSaved={() => { setOpen(false); load(); }} />
    </div>
  );
}

function RoleDialog({ open, onClose, role, permissions, onSaved }: any) {
  const [form, setForm] = useState<any>({ name: "", description: "", permissionIds: [] });
  useEffect(() => {
    setForm(role
      ? { name: role.name, description: role.description ?? "", permissionIds: role.permissions.map((p: any) => p.permissionId) }
      : { name: "", description: "", permissionIds: [] }
    );
  }, [role, open]);

  const byModule: Record<string, any[]> = {};
  permissions.forEach((p: any) => {
    byModule[p.module] ??= [];
    byModule[p.module].push(p);
  });

  function toggle(id: string) {
    const s = new Set(form.permissionIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setForm({ ...form, permissionIds: Array.from(s) });
  }
  function toggleAll(module: string) {
    const mods = (byModule[module] ?? []).map((p) => p.id);
    const all = mods.every((id) => form.permissionIds.includes(id));
    const s = new Set(form.permissionIds);
    mods.forEach((id) => (all ? s.delete(id) : s.add(id)));
    setForm({ ...form, permissionIds: Array.from(s) });
  }

  async function save() {
    try {
      const res = await fetch(role ? `/api/roles/${role.id}` : "/api/roles", {
        method: role ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{role ? "編輯角色" : "新增角色"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>角色名稱 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1 col-span-1"><Label>描述</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <div className="border rounded-md p-3 max-h-[360px] overflow-y-auto space-y-3">
          {Object.keys(byModule).sort().map((mod) => (
            <div key={mod}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">{(MODULE_LABELS as any)[mod] ?? mod}</div>
                <button className="text-xs text-accent hover:underline" onClick={() => toggleAll(mod)}>全選/取消</button>
              </div>
              <div className="grid grid-cols-4 gap-1 text-sm">
                {byModule[mod].map((p: any) => (
                  <label key={p.id} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={form.permissionIds.includes(p.id)} onChange={() => toggle(p.id)} />
                    {(ACTION_LABELS as any)[p.action] ?? p.action}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={save}>儲存</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
