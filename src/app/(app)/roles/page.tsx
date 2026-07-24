import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { RolesClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("roles.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="角色權限" description="系統範本唯讀；租戶擁有人可建立只屬於本租戶的角色與權限">
      <RolesClient />
    </PageShell>
  );
}
