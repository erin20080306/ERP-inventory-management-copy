"use client";
import { useState, useEffect } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("common");
  const f = useTranslations("fields");
  const tParty = useTranslations("party");
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
      if (!res.ok) throw new Error((await res.json()).error || t("saveFailed"));
      toast.success(t("saved"));
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
            {row ? t("edit") : t("create")}
            {f(kind === "customer" ? "customer" : "supplier")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{f("code")} *</Label>
            <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{f("taxIdFull")}</Label>
            <Input value={form.taxId ?? ""} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{f("companyName")} *</Label>
            <Input value={form.companyName ?? ""} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{f("contact")}</Label>
            <Input value={form.contactName ?? ""} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{f("phone")}</Label>
            <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Email</Label>
            <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{f("address")}</Label>
            <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{f(kind === "customer" ? "collectionTerms" : "paymentTerms")}</Label>
            <Input value={form.paymentTerms ?? ""} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder={tParty("paymentTermsExample")} />
          </div>
          {kind === "customer" && (
            <div className="space-y-1">
              <Label>{f("creditLimit")}</Label>
              <Input type="number" value={form.creditLimit ?? 0} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
            </div>
          )}
          <div className="space-y-1 col-span-2">
            <Label>{t("remark")}</Label>
            <Textarea value={form.remark ?? ""} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            {f("active")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartyClient({ kind }: { kind: "customer" | "supplier" }) {
  const t = useTranslations("common");
  const f = useTranslations("fields");
  const tPage = useTranslations("pages");
  const tParty = useTranslations("party");
  const endpoint = kind === "customer" ? "/api/customers" : "/api/suppliers";
  return (
    <CrudTable<Party>
      endpoint={endpoint}
      moduleKey={kind === "customer" ? "customers" : "suppliers"}
      searchPlaceholder={tParty("searchPlaceholder")}
      FormDialog={(props) => <PartyDialog {...props} endpoint={endpoint} kind={kind} />}
      pdfTitle={tPage(kind === "customer" ? "customers.title" : "suppliers.title")}
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
        { key: "code", title: f("code"), render: (r) => <span className="font-mono text-xs">{r.code}</span>, editable: { type: "text" } },
        { key: "companyName", title: f("companyName"), editable: { type: "text" } },
        { key: "taxId", title: f("taxId"), editable: { type: "text" } },
        { key: "contactName", title: f("contact"), editable: { type: "text" } },
        { key: "phone", title: f("phone"), editable: { type: "text" } },
        { key: "email", title: "Email", editable: { type: "text" } },
        {
          key: "isActive",
          title: t("status"),
          render: (r) => (r.isActive ? <Badge variant="success">{f("active")}</Badge> : <Badge variant="danger">{f("inactive")}</Badge>),
        },
        { key: "updatedBy", title: f("updatedBy"), render: (r) => <span className="text-xs text-gray-500">{r.updatedBy || "-"}</span> },
      ]}
    />
  );
}
