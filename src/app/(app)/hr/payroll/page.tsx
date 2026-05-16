import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { PayrollClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("payroll.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="薪資管理" description="月薪資結算、自動計算勞健保/勞退/所得稅，可匯出 Excel">
      <PayrollClient />
    </PageShell>
  );
}
