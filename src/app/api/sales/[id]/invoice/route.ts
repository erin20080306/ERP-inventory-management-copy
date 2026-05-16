import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const POST = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.create");
  const order = await prisma.salesOrder.findUnique({
    where: { id: params.id },
    include: { customer: true, items: { include: { product: true } } },
  });
  if (!order) throw new Error("找不到銷售單");
  if (order.status === "CANCELLED" || order.status === "DRAFT") {
    throw new Error("草稿或已取消銷售單無法開立發票");
  }
  const number = await nextNumber("INV");
  const amountExTax = Number(order.subtotal) - Number(order.discount);
  const taxAmount = Number(order.taxAmount);
  const totalAmount = Number(order.total);

  const invoice = await prisma.invoice.create({
    data: {
      number,
      type: "SALES",
      invoiceDate: new Date(),
      customerId: order.customerId,
      amountExTax: +amountExTax.toFixed(2),
      taxAmount: +taxAmount.toFixed(2),
      totalAmount: +totalAmount.toFixed(2),
      status: "ISSUED",
      remark: `由銷售單 ${order.number} 自動開立`,
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
  // 若銷售單還沒到 INVOICED，更新狀態
  if (order.status === "CONFIRMED" || order.status === "SHIPPED") {
    await prisma.salesOrder.update({ where: { id: order.id }, data: { status: "INVOICED" } });
  }
  await audit({ userId: session.user.id, action: "issue_invoice", module: "sales", refId: order.id, detail: number });
  return NextResponse.json(invoice);
});
