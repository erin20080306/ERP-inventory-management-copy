import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { JournalClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("journals.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="傳票管理" description="建立、審核與作廢會計傳票，借貸必平衡">
      <JournalClient />
    </PageShell>
  );
}
