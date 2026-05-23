import { prisma } from "./prisma";

export type DocItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
};

export function calcTotals(items: DocItem[], isTaxable: boolean = true) {
  let subtotal = 0;
  let discount = 0;
  const computed = items.map((i) => {
    const qty = Math.round(Number(i.quantity));
    const price = Math.round(Number(i.unitPrice));
    const line = qty * price;
    const ldisc = Math.round(Number(i.discount ?? 0));
    const taxable = line - ldisc;
    subtotal += line;
    discount += ldisc;
    return { ...i, quantity: qty, unitPrice: price, discount: ldisc, subtotal: taxable };
  });
  const taxableTotal = subtotal - discount;
  const taxAmount = isTaxable ? Math.round(taxableTotal * 0.05) : 0;
  const total = subtotal - discount + taxAmount;
  return {
    subtotal,
    discount,
    taxAmount,
    total,
    computed,
  };
}

// 採購進貨：扣倉庫 += 數量，建立庫存異動，建立應付帳款
export async function receivePurchaseOrder(orderId: string, warehouseId: string) {
  return await prisma.$transaction(async (tx: any) => {
    const order = await tx.purchaseOrder.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new Error("找不到採購單");
    if (order.status === "POSTED") throw new Error("已過帳，不可重複");
    if (order.status === "VOIDED") throw new Error("採購單已作廢");

    for (const item of order.items) {
      const stock = await tx.inventoryStock.upsert({
        where: { productId_warehouseId: { productId: item.productId, warehouseId } },
        update: { quantity: { increment: item.quantity } },
        create: { tenantId: order.tenantId, productId: item.productId, warehouseId, quantity: item.quantity },
      });
      await tx.inventoryTransaction.create({
        data: {
          tenantId: order.tenantId,
          productId: item.productId,
          warehouseId,
          type: "PURCHASE_IN",
          quantity: item.quantity,
          unitCost: item.unitPrice,
          refType: "PURCHASE",
          refId: order.id,
          remark: `採購進貨 ${order.number}`,
        },
      });
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: item.quantity } });
    }

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: "POSTED", receivedAt: new Date(), warehouseId },
    });

    // 只在尚未建立應付時才建立（可能已在核准時建立）
    const existingAP = await tx.accountsPayable.findFirst({ where: { purchaseOrderId: order.id, tenantId: order.tenantId } });
    if (!existingAP) {
      await tx.accountsPayable.create({
        data: {
          tenantId: order.tenantId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          amount: order.total,
          status: "OPEN",
        },
      });
    }
    return true;
  });
}

export async function shipSalesOrder(orderId: string, warehouseId: string) {
  return await prisma.$transaction(async (tx: any) => {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new Error("找不到銷售單");
    if (order.status === "POSTED") throw new Error("已過帳，不可重複");
    if (order.status === "VOIDED") throw new Error("銷售單已作廢");

    for (const item of order.items) {
      const stock = await tx.inventoryStock.findUnique({
        where: { productId_warehouseId: { productId: item.productId, warehouseId } },
      });
      if (!stock || Number(stock.quantity) < Number(item.quantity)) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        throw new Error(`商品 ${prod?.sku ?? ""} 庫存不足`);
      }
      await tx.inventoryStock.update({
        where: { productId_warehouseId: { productId: item.productId, warehouseId } },
        data: { quantity: { decrement: item.quantity } },
      });
      await tx.inventoryTransaction.create({
        data: {
          tenantId: order.tenantId,
          productId: item.productId,
          warehouseId,
          type: "SALES_OUT",
          quantity: Number(item.quantity) * -1,
          unitCost: item.unitPrice,
          refType: "SALES",
          refId: order.id,
          remark: `銷售出貨 ${order.number}`,
        },
      });
      await tx.salesOrderItem.update({ where: { id: item.id }, data: { shippedQty: item.quantity } });
    }

    await tx.salesOrder.update({
      where: { id: order.id },
      data: { status: "POSTED", shippedAt: new Date(), warehouseId },
    });

    // 只在尚未建立應收時才建立（可能已在確認時建立）
    const existingAR = await tx.accountsReceivable.findFirst({ where: { salesOrderId: order.id, tenantId: order.tenantId } });
    if (!existingAR) {
      await tx.accountsReceivable.create({
        data: {
          tenantId: order.tenantId,
          customerId: order.customerId,
          salesOrderId: order.id,
          amount: order.total,
          status: "OPEN",
        },
      });
    }
    return true;
  });
}
