import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { SettingsClient } from "./client";
import { headers } from "next/headers";
import { isMedicalEnabledForRequest } from "@/lib/client-platform";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("pages");
  const g = await requirePermissionOrForbidden("settings.view");
  if (g.forbidden) return g.element;
  const medicalEnabled = isMedicalEnabledForRequest(await headers());
  return (
    <PageShell title={t("settings.title")} description={t("settings.description")}>
      <SettingsClient medicalEnabled={medicalEnabled} />
    </PageShell>
  );
}
