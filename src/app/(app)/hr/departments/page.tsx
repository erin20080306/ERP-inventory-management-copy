import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { DepartmentsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("hr.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="部門管理" description="公司組織部門設定">
      <DepartmentsClient />
    </PageShell>
  );
}
