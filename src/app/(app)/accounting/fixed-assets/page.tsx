import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { FixedAssetsClient } from "./client";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("assets.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("accountingFixedAssets.title")} description={t("accountingFixedAssets.description")}>
      <FixedAssetsClient />
    </PageShell>
  );
}
