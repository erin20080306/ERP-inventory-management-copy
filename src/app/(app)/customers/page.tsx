import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { PartyClient } from "@/components/party-client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("customers.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("customers.title")} description={t("customers.description")}>
      <PartyClient kind="customer" />
    </PageShell>
  );
}
