import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { FixedAssetsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("assets.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="固定資產目錄" description="土地、建築、機器、設備等固定資產登錄與折舊管理">
      <FixedAssetsClient />
    </PageShell>
  );
}
