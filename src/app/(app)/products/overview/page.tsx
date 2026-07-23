import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { getProductEdition } from "@/lib/product-editions";
import OverviewClient from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("products.view");
  if (g.forbidden) return g.element;
  const edition = getProductEdition(g.session.user.businessMode);
  return (
    <PageShell title="商品一覽表" description={`${edition.shortLabel}商品目錄的庫存、銷售、採購與毛利分析`}>
      <OverviewClient />
    </PageShell>
  );
}
