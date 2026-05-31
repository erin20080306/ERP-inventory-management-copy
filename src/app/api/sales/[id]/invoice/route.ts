import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { roundInvoiceAmount, roundInvoiceTax } from "@/lib/invoice-totals";

export const POST = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.create");
  const tenantId = await requireTenantId();
  const order = await prisma.salesOrder.findUnique({
    where: { id: params.id, tenantId },
    include: { customer: true, items: { include: { product: true } } },
  });
  if (!order) throw new Error("找不到銷售單");
  if (order.status === "VOIDED" || order.status === "DRAFT") {
    throw new Error("草稿或已作廢銷售單無法開立發票");
  }
  const number = await nextNumber("INV", tenantId);
  const amountExTax = +(Number(order.subtotal) - Number(order.discount)).toFixed(2);
  const taxAmount = roundInvoiceTax(order.taxAmount);
  const totalAmount = roundInvoiceAmount(amountExTax + taxAmount);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      number,
      type: "SALES",
      invoiceDate: new Date(),
      customerId: order.customerId,
      amountExTax,
      taxAmount,
      totalAmount,
      status: "POSTED",
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
  // 若銷售單還沒到 POSTED，更新狀態
  if (order.status === "SUBMITTED" || order.status === "APPROVED") {
    await prisma.salesOrder.update({ where: { id: order.id }, data: { status: "POSTED" } });
  }
  await audit({ userId: session.user.id, action: "issue_invoice", module: "sales", refId: order.id, detail: number });
  return NextResponse.json(invoice);
});
