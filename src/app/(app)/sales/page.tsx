import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { OrderClient } from "@/components/order-client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("sales.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="銷售管理" description="銷售訂單建立、出貨扣庫與應收帳款">
      <OrderClient kind="sales" />
    </PageShell>
  );
}
