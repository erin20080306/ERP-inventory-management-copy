"use client";
import { useState, useEffect } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Party = {
  id: string;
  code: string;
  companyName: string;
  taxId?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  creditLimit?: any;
  isActive: boolean;
  updatedBy?: string | null;
};

function PartyDialog({ open, onClose, row, onSaved, endpoint, kind }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm(row ?? { code: "", companyName: "", isActive: true, ...(kind === "customer" ? { creditLimit: 0 } : {}) });
  }, [row, open]);
  async function save() {
    setSaving(true);
    try {
      const res = await fetch(row ? `${endpoint}/${row.id}` : endpoint, {
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
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {row ? "編輯" : "新增"}
            {kind === "customer" ? "客戶" : "供應商"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>編號 *</Label>
            <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>統一編號</Label>
            <Input value={form.taxId ?? ""} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>公司名稱 *</Label>
            <Input value={form.companyName ?? ""} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>聯絡人</Label>
            <Input value={form.contactName ?? ""} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>電話</Label>
            <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Email</Label>
            <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>地址</Label>
            <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{kind === "customer" ? "收款條件" : "付款條件"}</Label>
            <Input value={form.paymentTerms ?? ""} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="例: 月結 30 天" />
          </div>
          {kind === "customer" && (
            <div className="space-y-1">
              <Label>信用額度</Label>
              <Input type="number" value={form.creditLimit ?? 0} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
            </div>
          )}
          <div className="space-y-1 col-span-2">
            <Label>備註</Label>
            <Textarea value={form.remark ?? ""} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            啟用
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartyClient({ kind }: { kind: "customer" | "supplier" }) {
  const endpoint = kind === "customer" ? "/api/customers" : "/api/suppliers";
  return (
    <CrudTable<Party>
      endpoint={endpoint}
      moduleKey={kind === "customer" ? "customers" : "suppliers"}
      searchPlaceholder="搜尋編號 / 公司名稱 / 統編 / 電話"
      FormDialog={(props) => <PartyDialog {...props} endpoint={endpoint} kind={kind} />}
      pdfTitle={kind === "customer" ? "客戶管理" : "供應商管理"}
      exportName={kind === "customer" ? "customers" : "suppliers"}
      templateHeaders={["編號", "公司名稱", "統編", "聯絡人", "電話", "Email", "地址"]}
      enableDateFilter={true}
      inlineEdit={true}
      importMap={(r) => ({
        code: String(r["編號"] ?? r.code ?? "").trim(),
        companyName: String(r["公司名稱"] ?? r.companyName ?? "").trim(),
        taxId: String(r["統編"] ?? r.taxId ?? "").trim() || undefined,
        contactName: String(r["聯絡人"] ?? r.contactName ?? "").trim() || undefined,
        phone: String(r["電話"] ?? r.phone ?? "").trim() || undefined,
        email: String(r["Email"] ?? r.email ?? "").trim() || undefined,
        address: String(r["地址"] ?? r.address ?? "").trim() || undefined,
      })}
      columns={[
        { key: "code", title: "編號", render: (r) => <span className="font-mono text-xs">{r.code}</span>, editable: { type: "text" } },
        { key: "companyName", title: "公司名稱", editable: { type: "text" } },
        { key: "taxId", title: "統編", editable: { type: "text" } },
        { key: "contactName", title: "聯絡人", editable: { type: "text" } },
        { key: "phone", title: "電話", editable: { type: "text" } },
        { key: "email", title: "Email", editable: { type: "text" } },
        {
          key: "isActive",
          title: "狀態",
          render: (r) => (r.isActive ? <Badge variant="success">啟用</Badge> : <Badge variant="danger">停用</Badge>),
        },
        { key: "updatedBy", title: "操作人員", render: (r) => <span className="text-xs text-gray-500">{r.updatedBy || "-"}</span> },
      ]}
    />
  );
}
