import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import OverviewClient from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("products.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="商品一覽表" description="商品庫存、銷售、採購、毛利分析總覽">
      <OverviewClient />
    </PageShell>
  );
}
