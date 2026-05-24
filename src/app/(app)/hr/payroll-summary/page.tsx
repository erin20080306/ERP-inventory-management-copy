import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { PayrollSummaryClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("payroll.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="每月薪資發放明細總表" description="查看每月薪資發放明細和統計">
      <PayrollSummaryClient />
    </PageShell>
  );
}
