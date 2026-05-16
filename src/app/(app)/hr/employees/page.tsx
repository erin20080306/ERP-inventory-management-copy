import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { EmployeesClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("hr.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="員工管理" description="員工基本資料、薪資設定與投保資訊">
      <EmployeesClient />
    </PageShell>
  );
}
