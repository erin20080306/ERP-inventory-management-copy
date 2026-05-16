import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { SettingsClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("settings.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="系統設定" description="公司基本資料、幣別與其他全域設定">
      <SettingsClient />
    </PageShell>
  );
}
