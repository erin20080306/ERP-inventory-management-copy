import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { InvoiceClient } from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("invoices.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell
      title={t("accountingInvoices.title")}
      description={t("accountingInvoices.description")}
    >
      <InvoiceClient />
    </PageShell>
  );
}
