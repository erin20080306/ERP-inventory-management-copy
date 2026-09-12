import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { ReorderClient } from "@/components/reorder-client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("purchases.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("purchasesReorder.title")} description={t("purchasesReorder.description")}>
      <ReorderClient />
    </PageShell>
  );
}
