import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { BomClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("inventory.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="BOM 總覽" description="一覽所有模組資料，可依日期篩選顯示">
      <BomClient />
    </PageShell>
  );
}
