import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { getEInvoiceReadiness, processEInvoiceEvent } from "@/lib/e-invoice";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  const status = req.nextUrl.searchParams.get("status");
  const [items, eligibleSales] = await Promise.all([
    prisma.electronicInvoice.findMany({
      where: {
        tenantId,
        ...(status && ["QUEUED", "ISSUED", "FAILED", "VOIDED"].includes(status) ? { status: status as any } : {}),
      },
      include: {
        posSale: { select: { id: true, number: true, total: true, createdAt: true } },
        events: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.posSale.findMany({
      where: { tenantId, status: "COMPLETED", electronicInvoice: null },
      select: {
        id: true,
        number: true,
        total: true,
        createdAt: true,
        customer: { select: { companyName: true, taxId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return NextResponse.json({ items, eligibleSales, readiness: getEInvoiceReadiness() });
});

const RetryInput = z.object({ eventId: z.string().min(1) });

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("approve", "sales.approve");
  const tenantId = await requireTenantId(session);
  const body = RetryInput.parse(await req.json());
  const event = await prisma.electronicInvoiceEvent.findFirst({
    where: { id: body.eventId, tenantId },
    include: { invoice: true },
  });
  if (!event) throw new ApiError(404, "找不到電子發票傳送事件");
  if (event.status === "COMPLETED") throw new ApiError(409, "此電子發票事件已完成，不需重送");
  const result = await processEInvoiceEvent(event.id);
  await audit({
    userId: session.user.id,
    action: "retry",
    module: "pos-einvoice",
    refId: event.invoiceId,
    detail: `${event.type}；結果 ${result?.status ?? "UNKNOWN"}`,
  });
  return NextResponse.json({ ok: true, event: result });
});
