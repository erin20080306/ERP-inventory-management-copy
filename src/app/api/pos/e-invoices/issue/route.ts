import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { createEInvoiceOutbox, processEInvoiceEvent } from "@/lib/e-invoice";
import { prisma } from "@/lib/prisma";

const Input = z.object({
  saleId: z.string().min(1),
  mode: z.enum(["PAPER", "MOBILE_CARRIER", "CITIZEN_CERT", "DONATION", "BUSINESS"]),
  buyerTaxId: z.string().trim().max(8).optional().nullable(),
  carrierId: z.string().trim().max(64).optional().nullable(),
  donationCode: z.string().trim().max(7).optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const body = Input.parse(await req.json());

  const outbox = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`einvoice-issue:${tenantId}:${body.saleId}`}))`;
    const sale = await tx.posSale.findFirst({
      where: { id: body.saleId, tenantId, status: "COMPLETED" },
      include: { items: { include: { product: true } }, electronicInvoice: true },
    });
    if (!sale) throw new ApiError(404, "找不到可開立電子發票的 POS 交易");
    if (sale.electronicInvoice) throw new ApiError(409, "此交易已建立電子發票，不可重複開立");
    return createEInvoiceOutbox(tx, {
      tenantId,
      sale,
      request: {
        mode: body.mode,
        buyerTaxId: body.buyerTaxId,
        carrierId: body.carrierId,
        donationCode: body.donationCode,
      },
    });
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

  const event = await processEInvoiceEvent(outbox.eventId);
  await audit({
    userId: session.user.id,
    action: "issue",
    module: "pos-einvoice",
    refId: outbox.invoice.id,
    detail: `補開 POS 電子發票；交易 ${body.saleId}；模式 ${body.mode}`,
  });
  return NextResponse.json({ ok: true, invoice: event?.invoice ?? outbox.invoice, event });
});
