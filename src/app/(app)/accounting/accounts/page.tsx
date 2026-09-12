import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { AccountClient } from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("accounts");
  const g = await requirePermissionOrForbidden("accounting.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("title")} description={t("description")}>
      <AccountClient />
    </PageShell>
  );
}
