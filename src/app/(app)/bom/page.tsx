import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { BomClient } from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("inventory.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("bom.title")} description={t("bom.description")}>
      <BomClient />
    </PageShell>
  );
}
