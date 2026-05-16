import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { InvoiceScanClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("invoices.create");
  if (g.forbidden) return g.element;
  return (
    <PageShell
      title="掃描發票"
      description="使用相機掃描電子發票 QR Code，或拍照記錄三聯式發票"
    >
      <InvoiceScanClient />
    </PageShell>
  );
}
