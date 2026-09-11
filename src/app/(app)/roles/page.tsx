import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { RolesClient } from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("roles.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("roles.title")} description={t("roles.description")}>
      <RolesClient />
    </PageShell>
  );
}
