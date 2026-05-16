import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { NotesClient } from "@/components/notes-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("notes.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="應付票據" description="本公司開立給供應商之票據管理（甲存支票）">
      <NotesClient kind="payable" />
    </PageShell>
  );
}
