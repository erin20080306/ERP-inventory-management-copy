import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { ProductClient } from "./client";
import { getProductEdition, normalizeBusinessMode } from "@/lib/product-editions";
import { getTranslations } from "next-intl/server";

export default async function ProductsPage() {
  const t = await getTranslations("pages");
  const tEdition = await getTranslations("editions");
  const g = await requirePermissionOrForbidden("products.view");
  if (g.forbidden) return g.element;
  const businessMode = normalizeBusinessMode(g.session.user.businessMode);
  const edition = getProductEdition(businessMode);
  return (
    <PageShell
      title={t("products.title")}
      description={t("products.description", { edition: tEdition(`${edition.mode}.shortLabel`) })}
    >
      <ProductClient isCommerce={businessMode === "ECOMMERCE"} />
    </PageShell>
  );
}
