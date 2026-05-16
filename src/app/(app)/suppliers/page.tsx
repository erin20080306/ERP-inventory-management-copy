import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { PartyClient } from "@/components/party-client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("suppliers.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="供應商管理" description="管理供應商資料、聯絡人與付款條件">
      <PartyClient kind="supplier" />
    </PageShell>
  );
}
