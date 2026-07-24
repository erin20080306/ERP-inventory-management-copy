import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { UserClient } from "./client";

export default async function Page() {
  const g = await requirePermissionOrForbidden("users.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="使用者管理" description="由租戶擁有人新增同租戶使用者，並指派租戶內可用的角色與權限">
      <UserClient />
    </PageShell>
  );
}
