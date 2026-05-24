import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { CashBankClient } from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("cash.view");
  if (g.forbidden) return g.element;
  return (
    <PageShell title="現金銀行" description="現金帳戶與銀行帳戶、轉帳與對帳">
      <CashBankClient />
    </PageShell>
  );
}
