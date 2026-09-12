import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { InvoiceScanClient } from "./client";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("invoices.create");
  if (g.forbidden) return g.element;
  return (
    <PageShell
      title={t("accountingInvoicesScan.title")}
      description={t("accountingInvoicesScan.description")}
    >
      <InvoiceScanClient />
    </PageShell>
  );
}
