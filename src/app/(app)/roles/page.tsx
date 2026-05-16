import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { RolesClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("roles.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="角色權限" description="管理角色與模組權限（RBAC）">
      <RolesClient />
    </PageShell>
  );
}
