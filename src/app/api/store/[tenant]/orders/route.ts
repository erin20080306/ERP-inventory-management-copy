import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { resolveStorefrontTenant } from "@/lib/storefront-members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TrackingInput = z.object({
  tokens: z.array(z.string().uuid()).min(1).max(20),
});

const PUBLIC_ORDER_STATUS: Record<string, string> = {
  DRAFT: "訂單處理中",
  SUBMITTED: "訂單已成立",
  APPROVED: "理貨中",
  PARTIALLY_SHIPPED: "部分出貨",
  POSTED: "已出貨",
  VOIDED: "已取消",
  REJECTED: "訂單待確認",
};

type HostFulfillment = {
  shipmentNumber?: string | null;
  shippedAt?: string | null;
};

function readHostFulfillment(remark: string | null): HostFulfillment | null {
  const encoded = remark?.match(/\[HOST-FULFILLMENT:([A-Za-z0-9_-]+)\]/)?.[1];
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed as HostFulfillment : null;
  } catch {
    return null;
  }
}

export const POST = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant } = await resolveStorefrontTenant(params.tenant);
  const input = TrackingInput.parse(await req.json());
  const tokens = [...new Set(input.tokens)];
  const orders = await prisma.salesOrder.findMany({
    where: {
      tenantId: tenant.id,
      OR: tokens.map((token) => ({ remark: { contains: `request=${token}` } })),
    },
    select: {
      number: true,
      status: true,
      total: true,
      createdAt: true,
      shippedAt: true,
      remark: true,
      _count: { select: { items: true } },
      shipments: {
        where: { status: "POSTED" },
        orderBy: { shipmentDate: "desc" },
        take: 1,
        select: { number: true, shipmentDate: true },
      },
      storefrontPayment: {
        select: { method: true, status: true, paidAt: true, refundedAmount: true },
      },
    },
  });

  return NextResponse.json({
    orders: orders.flatMap((order) => {
      const token = tokens.find((candidate) => order.remark?.includes(`request=${candidate}`));
      if (!token) return [];
      const latestShipment = order.shipments[0];
      const hostFulfillment = readHostFulfillment(order.remark);
      return [{
        trackingToken: token,
        id: order.number,
        status: PUBLIC_ORDER_STATUS[order.status] || order.status,
        total: Number(order.total),
        items: order._count.items,
        createdAt: order.createdAt.toISOString(),
        shipmentNumber: latestShipment?.number ?? hostFulfillment?.shipmentNumber ?? null,
        shippedAt: latestShipment?.shipmentDate.toISOString()
          ?? hostFulfillment?.shippedAt
          ?? order.shippedAt?.toISOString()
          ?? null,
        payment: order.storefrontPayment ? {
          method: order.storefrontPayment.method,
          status: order.storefrontPayment.status,
          charged: Boolean(order.storefrontPayment.paidAt),
          refundedAmount: Number(order.storefrontPayment.refundedAmount),
          nextAction: order.storefrontPayment.status === "AWAITING_TRANSFER"
            ? "等待商家確認匯款"
            : order.storefrontPayment.status === "GATEWAY_REQUIRED"
              ? "尚未串接實際金流，本次未扣款"
              : "",
          bankTransfer: null,
        } : undefined,
      }];
    }),
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
});
