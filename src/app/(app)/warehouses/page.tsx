import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { WarehouseClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("warehouses.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="倉庫管理" description="多倉庫設定與啟停用">
      <WarehouseClient />
    </PageShell>
  );
}
