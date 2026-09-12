import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import QuotationClient from "./client";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("quotations.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("quotations.title")} description={t("quotations.description")}>
      <QuotationClient />
    </PageShell>
  );
}
