import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { LedgerClient } from "@/components/ledger-client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("payables.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("accountingPayables.title")} description={t("accountingPayables.description")}>
      <LedgerClient kind="ap" />
    </PageShell>
  );
}
