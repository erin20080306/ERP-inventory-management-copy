import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { LedgerClient } from "@/components/ledger-client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("receivables.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="應收帳款" description="由銷售單自動產生；支援部分沖帳與逾期追蹤">
      <LedgerClient kind="ar" />
    </PageShell>
  );
}
