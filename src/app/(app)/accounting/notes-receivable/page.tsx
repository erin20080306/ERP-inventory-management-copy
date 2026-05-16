import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { NoteReceivableClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("notes.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="應收票據" description="客戶開立或背書轉讓之票據管理（支票/本票/匯票）">
      <NoteReceivableClient />
    </PageShell>
  );
}
