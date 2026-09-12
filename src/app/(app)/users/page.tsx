import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { UserClient } from "./client";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("users.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title={t("users.title")} description={t("users.description")}>
      <UserClient />
    </PageShell>
  );
}
