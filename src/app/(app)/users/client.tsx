"use client";
import { useEffect, useState } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRoleLabel } from "@/i18n/labels";
import { DEFAULT_ROLES } from "@/lib/permissions";

// 與資料庫比對用的原始角色名稱，不可翻譯；顯示才走 useRoleLabel()。
const SYSTEM_ADMIN_ROLE_NAME = DEFAULT_ROLES.SUPER_ADMIN.name;

function UserDialog({ open, onClose, row, onSaved }: any) {
  const m = useTranslations("users");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const roleLabel = useRoleLabel();
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
      if (!res.ok) throw new Error((await res.json()).error || tc("saveFailed"));
      toast.success(tc("saved"));
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
        <DialogHeader><DialogTitle>{row ? m("edit") : m("create")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>{m("account")} *</Label><Input disabled={!!row} value={form.username ?? ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div className="space-y-1"><Label>{f("fullName")} *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1 col-span-2">
            <Label>{row ? m("newPassword") : `${m("password")} *`}</Label>
            <Input type="password" value={form.password ?? ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>{m("role")}</Label>
            <div className="border rounded-md p-3 grid grid-cols-2 gap-2">
              {allRoles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={(form.roleIds ?? []).includes(r.id)}
                    disabled={r.tenantId === null && r.name === SYSTEM_ADMIN_ROLE_NAME}
                    onChange={() => toggleRole(r.id)}
                  />
                  {roleLabel(r.name)}
                  {r.tenantId === null && r.name === SYSTEM_ADMIN_ROLE_NAME && <Badge variant="outline">{m("ownerOnly")}</Badge>}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input
              type="checkbox"
              checked={!!form.isActive}
              disabled={!!row?.isTenantOwner}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {f("active")}
            {row?.isTenantOwner && <span className="text-xs text-muted-foreground">{m("tenantOwnerLocked")}</span>}
          </label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{tc("cancel")}</Button><Button onClick={save}>{tc("save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserClient() {
  const m = useTranslations("users");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const roleLabel = useRoleLabel();
  const { data: session } = useSession();
  const isTenantOwner = Boolean(session?.user?.isTenantOwner && !session.user.isSuperAdmin);
  return (
    <CrudTable
      endpoint="/api/users"
      searchPlaceholder={m("searchPlaceholder")}
      FormDialog={UserDialog}
      canCreate={isTenantOwner}
      canEdit={isTenantOwner}
      canDelete={isTenantOwner}
      canDeleteRow={(row: any) => !row.isTenantOwner}
      columns={[
        { key: "username", title: m("account"), render: (r: any) => <span className="font-mono text-xs">{r.username}</span> },
        { key: "name", title: f("fullName") },
        { key: "email", title: "Email" },
        { key: "roles", title: m("role"), render: (r: any) => (
          <div className="flex flex-wrap gap-1">
            {r.isTenantOwner && <Badge variant="success">{m("tenantOwner")}</Badge>}
            {(r.roles ?? []).map((ro: any) => <Badge key={ro.id} variant="info">{ro.name}</Badge>)}
          </div>
        )},
        { key: "lastLoginAt", title: m("lastLogin"), render: (r: any) => r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "—" },
        { key: "isActive", title: tc("status"), render: (r: any) => (r.isActive ? <Badge variant="success">{f("active")}</Badge> : <Badge variant="danger">{f("inactive")}</Badge>) },
      ]}
    />
  );
}
