import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { CostManagementClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("products.edit");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="成本管理" description="商品成本與售價統一維護，支援 Excel 批次匯入更新">
      <CostManagementClient />
    </PageShell>
  );
}
