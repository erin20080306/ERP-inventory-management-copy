import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { PartyClient } from "@/components/party-client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("suppliers.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("suppliers.title")} description={t("suppliers.description")}>
      <PartyClient kind="supplier" />
    </PageShell>
  );
}
