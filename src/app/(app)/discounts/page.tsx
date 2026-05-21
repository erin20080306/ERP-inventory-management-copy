import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import DiscountClient from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("accounting.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="折讓單" description="銷售折讓 / 進貨折讓">
      <DiscountClient />
    </PageShell>
  );
}
