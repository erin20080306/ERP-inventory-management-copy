import { ApiError } from "./api";
import { createPostedJournal } from "./documents";
import { prisma } from "./prisma";

export type RestaurantCancellationDisposition = "NOT_PREPARED" | "WASTE";

type CancelRestaurantItemInput = {
  tenantId: string;
  userId: string;
  itemId: string;
  reason: string;
  disposition: RestaurantCancellationDisposition;
};

const ACTIVE_ORDER_STATUSES = ["OPEN", "SENT", "PREPARING", "READY"];

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function deriveTicketStatus(statuses: string[]) {
  const active = statuses.filter((status) => status !== "CANCELLED");
  if (!active.length) return "CANCELLED";
  if (active.every((status) => status === "SERVED")) return "SERVED";
  if (active.every((status) => ["READY", "SERVED"].includes(status))) return "READY";
  if (active.some((status) => ["PREPARING", "READY", "SERVED"].includes(status))) return "PREPARING";
  return "NEW";
}

function deriveOrderStatus(statuses: string[]) {
  const active = statuses.filter((status) => status !== "CANCELLED");
  if (!active.length || active.every((status) => status === "PENDING")) return "OPEN";
  if (active.every((status) => ["READY", "SERVED"].includes(status))) return "READY";
  if (active.some((status) => ["PREPARING", "READY", "SERVED"].includes(status))) return "PREPARING";
  return "SENT";
}

export async function cancelRestaurantItem(input: CancelRestaurantItemInput) {
  const reason = input.reason.trim();
  if (reason.length < 2) throw new ApiError(400, "請輸入至少 2 個字的取消原因");

  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-item:${input.tenantId}:${input.itemId}`}))`;
    const item = await tx.restaurantOrderItem.findFirst({
      where: {
        id: input.itemId,
        order: { tenantId: input.tenantId, status: { in: ACTIVE_ORDER_STATUSES } },
      },
      include: {
        product: { select: { name: true, sku: true, costPrice: true } },
        order: { include: { register: { select: { warehouseId: true } } } },
        ticketItems: { select: { ticketId: true } },
      },
    });
    if (!item) throw new ApiError(404, "找不到可取消的餐點");
    if (item.status === "CANCELLED") throw new ApiError(409, "此餐點已取消");
    if (input.disposition === "NOT_PREPARED" && !["PENDING", "SENT"].includes(item.status)) {
      throw new ApiError(409, "餐點已開始製作，只能以報廢方式取消");
    }

    const cancelledAt = new Date();
    const quantity = Number(item.quantity);
    const unitCost = Number(item.product.costPrice);
    const wasteAmount = input.disposition === "WASTE" ? roundMoney(quantity * unitCost) : 0;

    if (input.disposition === "WASTE") {
      const warehouseId = item.order.register.warehouseId;
      const changed = await tx.inventoryStock.updateMany({
        where: {
          tenantId: input.tenantId,
          productId: item.productId,
          warehouseId,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      });
      if (changed.count !== 1) throw new ApiError(409, `${item.product.name} 庫存不足，無法登錄報廢耗用`);
      await tx.inventoryTransaction.create({
        data: {
          tenantId: input.tenantId,
          productId: item.productId,
          warehouseId,
          type: "ADJUST_OUT",
          quantity: quantity * -1,
          unitCost,
          refType: "RESTAURANT_WASTE",
          refId: item.id,
          remark: `取消餐點報廢：${item.product.name}；原因：${reason}`,
        },
      });
      if (wasteAmount > 0) {
        await createPostedJournal(tx, input.tenantId, `餐飲取消報廢（桌單 ${item.order.number}）`, input.userId, [
          { code: "5101", debit: wasteAmount, memo: `餐點報廢耗用－${item.product.name}` },
          { code: "1201", credit: wasteAmount, memo: `存貨轉報廢－${item.product.name}` },
        ]);
      }
    }

    const updated = await tx.restaurantOrderItem.update({
      where: { id: item.id },
      data: {
        status: "CANCELLED",
        cancelReason: reason,
        cancelDisposition: input.disposition,
        cancelledAt,
        cancelledById: input.userId,
      },
      include: { product: true },
    });

    for (const { ticketId } of item.ticketItems) {
      const ticketItems = await tx.restaurantKitchenTicketItem.findMany({
        where: { ticketId },
        include: { orderItem: { select: { status: true } } },
      });
      const ticketStatus = deriveTicketStatus(ticketItems.map((row: any) => row.orderItem.status));
      await tx.restaurantKitchenTicket.update({
        where: { id: ticketId },
        data: {
          status: ticketStatus,
          cancelledAt: ticketStatus === "CANCELLED" ? cancelledAt : null,
          servedAt: ticketStatus === "SERVED" ? cancelledAt : undefined,
        },
      });
    }

    const siblings = await tx.restaurantOrderItem.findMany({
      where: { orderId: item.orderId },
      select: { status: true },
    });
    await tx.restaurantOrder.update({
      where: { id: item.orderId },
      data: { status: deriveOrderStatus(siblings.map((row: any) => row.status)) },
    });

    return { item: updated, wasteAmount, cancelledAt };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}