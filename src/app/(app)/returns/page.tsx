import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import ReturnsClient from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("returns.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="退貨管理" description="銷售退貨 / 採購退貨，自動調整庫存與帳款">
      <ReturnsClient />
    </PageShell>
  );
}
