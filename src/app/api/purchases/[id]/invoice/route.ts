import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const POST = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.create");
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { supplier: true, items: { include: { product: true } } },
  });
  if (!order) throw new Error("找不到採購單");
  if (order.status === "CANCELLED" || order.status === "DRAFT") {
    throw new Error("草稿或已取消採購單無法開立發票");
  }
  const number = await nextNumber("INV");
  const invoice = await prisma.invoice.create({
    data: {
      number,
      type: "PURCHASE",
      invoiceDate: new Date(),
      supplierId: order.supplierId,
      amountExTax: +(Number(order.subtotal) - Number(order.discount)).toFixed(2),
      taxAmount: +Number(order.taxAmount).toFixed(2),
      totalAmount: +Number(order.total).toFixed(2),
      status: "ISSUED",
      remark: `由採購單 ${order.number} 自動開立`,
      items: {
        create: order.items.map((i: any) => ({
          description: `${i.product.sku} ${i.product.name}`,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          taxRate: Number(i.taxRate),
          subtotal: Number(i.subtotal),
        })),
      },
    },
  });
  await audit({ userId: session.user.id, action: "issue_invoice", module: "purchases", refId: order.id, detail: number });
  return NextResponse.json(invoice);
});
