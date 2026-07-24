import Link from "next/link";
import { ArrowLeft, PackageCheck } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { OrderClient } from "@/components/order-client";

export default async function FulfillmentPage() {
  const guard = await requirePermissionOrForbidden("sales.view");
  if (guard.forbidden) return guard.element;

  return (
    <PageShell
      title="電商接單與出貨"
      description="商城訂單核准後，選擇倉庫與本次出貨數量；完成時同步扣除實體庫存、建立出貨單、應收與會計傳票。"
      actions={(
        <Link href="/sales" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
          全部銷售單
        </Link>
      )}
    >
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
        <div className="flex items-center gap-2 font-bold"><PackageCheck className="h-5 w-5" />商城履約不會在下單時先扣實體庫存</div>
        <p className="mt-1 leading-6">下單先保留可售量；按下「確認本次出貨」後才扣除所選倉庫庫存。可分批出貨，未交數量會留在此頁繼續處理。</p>
      </div>
      <OrderClient
        kind="sales"
        channel="WEB"
        statuses={["SUBMITTED", "APPROVED", "PARTIALLY_SHIPPED"]}
        fulfillmentMode
      />
    </PageShell>
  );
}
