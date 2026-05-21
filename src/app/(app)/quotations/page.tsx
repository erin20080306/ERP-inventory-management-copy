import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import QuotationClient from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("quotations.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="報價單" description="管理客戶報價與狀態">
      <QuotationClient />
    </PageShell>
  );
}
