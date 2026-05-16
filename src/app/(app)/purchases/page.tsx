import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { OrderClient } from "@/components/order-client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("purchases.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="採購管理" description="採購單建立、核准、進貨入庫與應付帳款">
      <OrderClient kind="purchase" />
    </PageShell>
  );
}
