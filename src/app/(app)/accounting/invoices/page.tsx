import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { InvoiceClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("invoices.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell
      title="發票管理"
      description="銷項 / 進項發票。可手動新增，或從銷售 / 採購單一鍵開立。"
    >
      <InvoiceClient />
    </PageShell>
  );
}
