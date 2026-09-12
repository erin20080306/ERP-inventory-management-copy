import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { JournalClient } from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("journals.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("accountingJournals.title")} description={t("accountingJournals.description")}>
      <JournalClient />
    </PageShell>
  );
}
