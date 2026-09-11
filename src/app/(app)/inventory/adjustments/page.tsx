import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import AdjustmentClient from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("inventory.edit");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("inventoryAdjustments.title")} description={t("inventoryAdjustments.description")}>
      <AdjustmentClient />
    </PageShell>
  );
}
