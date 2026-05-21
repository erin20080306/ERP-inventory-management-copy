import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import AdjustmentClient from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("inventory.edit");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="期末盤點調整" description="庫存盤點與調整，自動切傳票">
      <AdjustmentClient />
    </PageShell>
  );
}
