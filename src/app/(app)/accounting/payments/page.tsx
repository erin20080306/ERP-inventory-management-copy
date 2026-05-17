import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { PaymentHistoryClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("receivables.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="已沖帳記錄" description="所有收款、付款、折讓記錄">
      <PaymentHistoryClient />
    </PageShell>
  );
}
