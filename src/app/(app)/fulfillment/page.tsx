import Link from "next/link";
import { ArrowLeft, PackageCheck } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { OrderClient } from "@/components/order-client";
import { getTranslations } from "next-intl/server";

export default async function FulfillmentPage() {
  const t = await getTranslations("pages");
  const tPage = await getTranslations("fulfillment");
  const guard = await requirePermissionOrForbidden("sales.view");
  if (guard.forbidden) return guard.element;

  return (
    <PageShell
      title={t("fulfillment.title")}
      description={t("fulfillment.description")}
      actions={(
        <Link href="/sales" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
          {tPage("allSalesOrders")}
        </Link>
      )}
    >
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
        <div className="flex items-center gap-2 font-bold"><PackageCheck className="h-5 w-5" />{tPage("noticeTitle")}</div>
        <p className="mt-1 leading-6">{tPage("noticeBody")}</p>
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
