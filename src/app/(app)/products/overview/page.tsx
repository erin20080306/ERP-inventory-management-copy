import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { getProductEdition } from "@/lib/product-editions";
import OverviewClient from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const tEdition = await getTranslations("editions");
  const g = await requirePermissionOrForbidden("products.view");
  if (g.forbidden) return g.element;
  const edition = getProductEdition(g.session.user.businessMode);
  return (
    <PageShell title={t("productsOverview.title")} description={t("productsOverview.description", { edition: tEdition(`${edition.mode}.shortLabel`) })}>
      <OverviewClient />
    </PageShell>
  );
}
