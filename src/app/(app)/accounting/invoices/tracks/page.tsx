import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { InvoiceTrackClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("invoices.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="發票字軌管理" description="設定電子發票字軌、號碼區間，開立發票時自動取號">
      <InvoiceTrackClient />
    </PageShell>
  );
}
