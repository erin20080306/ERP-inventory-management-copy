import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { WarehouseClient } from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("warehouses.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("warehouses.title")} description={t("warehouses.description")}>
      <WarehouseClient />
    </PageShell>
  );
}
