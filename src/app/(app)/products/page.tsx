import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { ProductClient } from "./client";
import { normalizeBusinessMode } from "@/lib/product-editions";

export default async function ProductsPage() {
  const g = await requirePermissionOrForbidden("products.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="商品管理" description="管理商品資料、規格、成本與售價">
      <ProductClient isCommerce={normalizeBusinessMode(g.session.user.businessMode) === "ECOMMERCE"} />
    </PageShell>
  );
}
