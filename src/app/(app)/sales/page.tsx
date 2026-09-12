import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { OrderClient } from "@/components/order-client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("sales.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("sales.title")} description={t("sales.description")}>
      <OrderClient kind="sales" serverExcelExport="/api/sales/export" />
    </PageShell>
  );
}
