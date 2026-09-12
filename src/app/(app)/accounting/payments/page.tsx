import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { PaymentHistoryClient } from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("receivables.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("accountingPayments.title")} description={t("accountingPayments.description")}>
      <PaymentHistoryClient />
    </PageShell>
  );
}
