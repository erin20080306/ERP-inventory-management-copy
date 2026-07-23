import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { ProductClient } from "./client";
import { getProductEdition, normalizeBusinessMode } from "@/lib/product-editions";

export default async function ProductsPage() {
  const g = await requirePermissionOrForbidden("products.view");
  if (g.forbidden) return g.element;
  const businessMode = normalizeBusinessMode(g.session.user.businessMode);
  const edition = getProductEdition(businessMode);
  return (
    <PageShell
      title="商品管理"
      description={`目前顯示「${edition.shortLabel}」獨立商品目錄；新增、修改與刪除不會影響其他營運模式。`}
    >
      <ProductClient isCommerce={businessMode === "ECOMMERCE"} />
    </PageShell>
  );
}
