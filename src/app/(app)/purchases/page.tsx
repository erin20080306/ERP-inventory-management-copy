import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { OrderClient } from "@/components/order-client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("purchases.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("purchases.title")} description={t("purchases.description")}>
      <OrderClient kind="purchase" serverExcelExport="/api/purchases/export" />
    </PageShell>
  );
}
