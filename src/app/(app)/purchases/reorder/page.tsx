import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { ReorderClient } from "@/components/reorder-client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("purchases.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="智慧補貨" description="依銷售趨勢、前置期與安全庫存推算建議採購量，一鍵生成採購草稿">
      <ReorderClient />
    </PageShell>
  );
}
