import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { NotesClient } from "@/components/notes-client";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("notes.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("accountingNotesPayable.title")} description={t("accountingNotesPayable.description")}>
      <NotesClient kind="payable" />
    </PageShell>
  );
}
