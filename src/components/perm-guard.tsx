import { getSession } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { ForbiddenPage } from "@/components/layout/page-shell";

export async function requirePermissionOrForbidden(code: string) {
  const session = await getSession();
  if (!session?.user || !hasPermission(session.user.permissions, code)) {
    return { forbidden: true as const, element: <ForbiddenPage /> };
  }
  return { forbidden: false as const, session };
}
