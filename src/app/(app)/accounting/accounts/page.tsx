import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { AccountClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("accounting.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="會計科目" description="維護科目表、科目類型與期初餘額">
      <AccountClient />
    </PageShell>
  );
}
