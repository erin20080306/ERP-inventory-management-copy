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
import { useTranslations } from "next-intl";
import { useModuleLabel, useActionLabel, useRoleLabel } from "@/i18n/labels";
import { useSession } from "next-auth/react";

export function RolesClient() {
  const t = useTranslations("rolesPage");
  const moduleLabel = useModuleLabel();
  const actionLabel = useActionLabel();
  const roleLabel = useRoleLabel();
  const { data: session } = useSession();
  const isTenantOwner = Boolean(session?.user?.isTenantOwner && !session.user.isSuperAdmin);
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
    if (!confirm(t("confirmDelete"))) return;
    const res = await fetch(`/api/roles/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error((await res.json()).error || t("deleteFailed"));
    toast.success(t("deleted"));
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {isTenantOwner && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" />{t("newTenantRole")}</Button>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {roles.length === 0 && <EmptyState />}
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>{roleLabel(r.name)}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
              </div>
              <div className="flex items-center gap-1">
                {r.tenantId === null && <Badge variant="outline">{t("systemTemplate")}</Badge>}
                {isTenantOwner && r.tenantId !== null && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(r)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">{t("permissionCount", { count: r.permissions.length })}</div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {r.permissions.slice(0, 15).map((rp: any) => {
                  const p = permissions.find((x) => x.id === rp.permissionId);
                  if (!p) return null;
                  const label = `${moduleLabel(p.module)}·${actionLabel(p.action)}`;
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
  const t = useTranslations("rolesPage");
  const tCommon = useTranslations("common");
  const moduleLabel = useModuleLabel();
  const actionLabel = useActionLabel();
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
      if (!res.ok) throw new Error((await res.json()).error || t("saveFailed"));
      toast.success(t("saved"));
      onSaved();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{role ? t("editRole") : t("createRole")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>{t("roleName")} *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1 col-span-1"><Label>{t("description")}</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <div className="border rounded-md p-3 max-h-[360px] overflow-y-auto space-y-3">
          {Object.keys(byModule).sort().map((mod) => (
            <div key={mod}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">{moduleLabel(mod)}</div>
                <button className="text-xs text-accent hover:underline" onClick={() => toggleAll(mod)}>{t("toggleAll")}</button>
              </div>
              <div className="grid grid-cols-4 gap-1 text-sm">
                {byModule[mod].map((p: any) => (
                  <label key={p.id} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={form.permissionIds.includes(p.id)} onChange={() => toggle(p.id)} />
                    {actionLabel(p.action)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{tCommon("cancel")}</Button><Button onClick={save}>{tCommon("save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
