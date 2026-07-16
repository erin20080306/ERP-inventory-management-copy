import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requireRestaurantPermission, requireTenantId } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { nextNumberInTransaction } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { createRestaurantTable, deleteRestaurantTableSafely, setRestaurantTableActive, updateRestaurantTable } from "@/lib/restaurant-tables";

const TableFields = {
  areaId: z.string().min(1),
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/, "桌位代碼只能使用英數字、底線或連字號"),
  name: z.string().trim().min(1).max(40),
  seats: z.coerce.number().int().min(1).max(99),
  sortOrder: z.coerce.number().int().min(0).max(9999),
};

const ActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CREATE_TABLE"), ...TableFields }),
  z.object({ action: z.literal("UPDATE_TABLE"), tableId: z.string().min(1), ...TableFields }),
  z.object({ action: z.literal("SET_TABLE_ACTIVE"), tableId: z.string().min(1), isActive: z.boolean() }),
  z.object({ action: z.literal("DELETE_TABLE"), tableId: z.string().min(1) }),
  z.object({ action: z.literal("OPEN_TABLE"), tableId: z.string().min(1), shiftId: z.string().min(1), guests: z.coerce.number().int().min(1).max(99) }),
  z.object({ action: z.literal("ADD_ITEM"), orderId: z.string().min(1), productId: z.string().min(1), quantity: z.coerce.number().positive().max(99).default(1), note: z.string().trim().max(200).optional().default("") }),
  z.object({ action: z.literal("UPDATE_ITEM"), itemId: z.string().min(1), quantity: z.coerce.number().min(0).max(99), note: z.string().trim().max(200).optional().default("") }),
  z.object({ action: z.literal("SEND_KITCHEN"), orderId: z.string().min(1) }),
  z.object({ action: z.literal("SET_ITEM_STATUS"), itemId: z.string().min(1), status: z.enum(["PREPARING", "READY", "SERVED"]) }),
  z.object({ action: z.literal("MOVE_TABLE"), orderId: z.string().min(1), targetTableId: z.string().min(1) }),
  z.object({ action: z.literal("CANCEL_ORDER"), orderId: z.string().min(1), reason: z.string().trim().min(2).max(200) }),
]);

const ACTIVE_ORDER_STATUSES = ["OPEN", "SENT", "PREPARING", "READY"] as const;

function orderInclude() {
  return {
    table: { include: { area: true } },
    items: { include: { product: { select: { id: true, sku: true, name: true, imageUrl: true, salePrice: true } } }, orderBy: { createdAt: "asc" as const } },
    tickets: { include: { items: true }, orderBy: { sentAt: "desc" as const } },
  };
}

export const GET = apiHandler(async () => {
  const session = await requireRestaurantPermission("view");
  const tenantId = await requireTenantId(session);
  const canManageTables = hasPermission(session.user.permissions, "restaurant.manage");
  const [registers, openShift, areas, products, categories, kitchenTickets, tableSettings] = await Promise.all([
    prisma.posRegister.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, warehouseId: true, warehouse: { select: { name: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.posShift.findFirst({
      where: { tenantId, userId: session.user.id, status: "OPEN" },
      include: { register: { select: { id: true, code: true, name: true, warehouseId: true } } },
      orderBy: { openedAt: "desc" },
    }),
    prisma.restaurantArea.findMany({
      where: { tenantId, isActive: true },
      include: {
        tables: {
          where: { isActive: true },
          include: { orders: { where: { status: { in: [...ACTIVE_ORDER_STATUSES] } }, include: orderInclude(), take: 1, orderBy: { openedAt: "desc" } } },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, sku: true, name: true, imageUrl: true, salePrice: true, categoryId: true, category: { select: { name: true } }, stocks: { select: { quantity: true } } },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      take: 300,
    }),
    prisma.productCategory.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.restaurantKitchenTicket.findMany({
      where: { tenantId, status: { in: ["NEW", "PREPARING", "READY"] } },
      include: { order: { include: { table: true } }, items: { include: { orderItem: { include: { product: { select: { name: true, imageUrl: true } } } } } } },
      orderBy: { sentAt: "asc" },
      take: 100,
    }),
    canManageTables
      ? prisma.restaurantArea.findMany({
          where: { tenantId },
          include: {
            tables: {
              include: { _count: { select: { orders: true } } },
              orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            },
          },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  return NextResponse.json({
    registers,
    openShift,
    areas,
    categories,
    products: products.map((product) => ({ ...product, salePrice: Number(product.salePrice), stockTotal: product.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0), stocks: undefined })),
    kitchenTickets,
    canManageTables,
    tableSettings,
    serverTime: new Date().toISOString(),
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = ActionInput.parse(await req.json());
  const isTableManagement = ["CREATE_TABLE", "UPDATE_TABLE", "SET_TABLE_ACTIVE", "DELETE_TABLE"].includes(body.action);
  const permission = isTableManagement
    ? "manage"
    : body.action === "SET_ITEM_STATUS" || body.action === "MOVE_TABLE"
    ? "edit"
    : body.action === "SEND_KITCHEN"
      ? "submit"
      : body.action === "CANCEL_ORDER"
        ? "approve"
        : "create";
  const session = await requireRestaurantPermission(permission);
  const tenantId = await requireTenantId(session);

  if (body.action === "CREATE_TABLE") {
    const table = await createRestaurantTable(tenantId, body);
    await audit({ userId: session.user.id, action: "restaurant_table_create", module: "restaurant", refId: table.id, detail: `${table.code} ${table.name}` });
    return NextResponse.json({ ok: true, table });
  }

  if (body.action === "UPDATE_TABLE") {
    const table = await updateRestaurantTable(tenantId, body.tableId, body);
    await audit({ userId: session.user.id, action: "restaurant_table_update", module: "restaurant", refId: table.id, detail: `${table.code} ${table.name}` });
    return NextResponse.json({ ok: true, table });
  }

  if (body.action === "SET_TABLE_ACTIVE") {
    const table = await setRestaurantTableActive(tenantId, body.tableId, body.isActive);
    await audit({ userId: session.user.id, action: body.isActive ? "restaurant_table_restore" : "restaurant_table_deactivate", module: "restaurant", refId: table.id, detail: `${table.code} ${table.name}` });
    return NextResponse.json({ ok: true, table });
  }

  if (body.action === "DELETE_TABLE") {
    const result = await deleteRestaurantTableSafely(tenantId, body.tableId);
    await audit({ userId: session.user.id, action: result.mode === "DELETED" ? "restaurant_table_delete" : "restaurant_table_archive", module: "restaurant", refId: result.table.id, detail: `${result.table.code} ${result.table.name}` });
    return NextResponse.json({ ok: true, ...result });
  }

  if (body.action === "OPEN_TABLE") {
    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-table:${tenantId}:${body.tableId}`}))`;
      const shift = await tx.posShift.findFirst({ where: { id: body.shiftId, tenantId, userId: session.user.id, status: "OPEN" } });
      if (!shift) throw new ApiError(409, "請先開班，或目前班次已結束");
      const table = await tx.restaurantTable.findFirst({ where: { id: body.tableId, tenantId, isActive: true } });
      if (!table) throw new ApiError(404, "找不到桌位");
      const existing = await tx.restaurantOrder.findFirst({ where: { tenantId, tableId: table.id, status: { in: [...ACTIVE_ORDER_STATUSES] } }, include: orderInclude() });
      if (existing) return { order: existing, reused: true };
      if (table.status !== "AVAILABLE") throw new ApiError(409, "桌位目前不可開桌");
      const number = await nextNumberInTransaction(tx, "DINE", tenantId);
      const order = await tx.restaurantOrder.create({
        data: { tenantId, tableId: table.id, shiftId: shift.id, registerId: shift.registerId, number, guests: body.guests, createdById: session.user.id },
        include: orderInclude(),
      });
      await tx.restaurantTable.update({ where: { id: table.id }, data: { status: "OCCUPIED" } });
      return { order, reused: false };
    });
    if (!result.reused) await audit({ userId: session.user.id, action: "restaurant_open_table", module: "restaurant", refId: result.order.id, detail: result.order.number });
    return NextResponse.json({ ok: true, ...result });
  }

  if (body.action === "ADD_ITEM") {
    const order = await prisma.restaurantOrder.findFirst({ where: { id: body.orderId, tenantId, shift: { userId: session.user.id, status: "OPEN" }, status: { in: [...ACTIVE_ORDER_STATUSES] } } });
    if (!order) throw new ApiError(409, "找不到可點餐的桌單，或不是你的班次");
    const product = await prisma.product.findFirst({ where: { id: body.productId, tenantId, isActive: true }, select: { id: true, salePrice: true } });
    if (!product) throw new ApiError(404, "餐點已停用或不存在");
    const same = await prisma.restaurantOrderItem.findFirst({ where: { orderId: order.id, productId: product.id, note: body.note || null, status: "PENDING" } });
    const item = same
      ? await prisma.restaurantOrderItem.update({ where: { id: same.id }, data: { quantity: { increment: body.quantity } }, include: { product: true } })
      : await prisma.restaurantOrderItem.create({ data: { orderId: order.id, productId: product.id, quantity: body.quantity, unitPrice: product.salePrice, note: body.note || null }, include: { product: true } });
    return NextResponse.json({ ok: true, item });
  }

  if (body.action === "UPDATE_ITEM") {
    const item = await prisma.restaurantOrderItem.findFirst({ where: { id: body.itemId, order: { tenantId, shift: { userId: session.user.id, status: "OPEN" }, status: { in: [...ACTIVE_ORDER_STATUSES] } }, status: "PENDING" } });
    if (!item) throw new ApiError(409, "只有尚未送廚的餐點可修改");
    if (body.quantity === 0) {
      await prisma.restaurantOrderItem.delete({ where: { id: item.id } });
      return NextResponse.json({ ok: true, deleted: true });
    }
    const updated = await prisma.restaurantOrderItem.update({ where: { id: item.id }, data: { quantity: body.quantity, note: body.note || null }, include: { product: true } });
    return NextResponse.json({ ok: true, item: updated });
  }

  if (body.action === "SEND_KITCHEN") {
    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-order:${tenantId}:${body.orderId}`}))`;
      const order = await tx.restaurantOrder.findFirst({ where: { id: body.orderId, tenantId, shift: { userId: session.user.id, status: "OPEN" }, status: { in: [...ACTIVE_ORDER_STATUSES] } }, include: { items: { where: { status: "PENDING" } } } });
      if (!order) throw new ApiError(409, "找不到可送廚的桌單");
      if (!order.items.length) throw new ApiError(400, "沒有尚未送廚的餐點");
      const number = await nextNumberInTransaction(tx, "KOT", tenantId);
      const ticket = await tx.restaurantKitchenTicket.create({
        data: { tenantId, orderId: order.id, number, items: { create: order.items.map((item: any) => ({ orderItemId: item.id })) } },
      });
      await tx.restaurantOrderItem.updateMany({ where: { id: { in: order.items.map((item: any) => item.id) } }, data: { status: "SENT" } });
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "SENT", sentAt: order.sentAt ?? new Date() } });
      return ticket;
    });
    await audit({ userId: session.user.id, action: "restaurant_send_kitchen", module: "restaurant", refId: result.id, detail: result.number });
    return NextResponse.json({ ok: true, ticket: result });
  }

  if (body.action === "SET_ITEM_STATUS") {
    const result = await prisma.$transaction(async (tx: any) => {
      const item = await tx.restaurantOrderItem.findFirst({ where: { id: body.itemId, order: { tenantId, status: { in: [...ACTIVE_ORDER_STATUSES] } } }, include: { ticketItems: true } });
      if (!item) throw new ApiError(404, "找不到出餐項目");
      const allowed: Record<string, string[]> = { SENT: ["PREPARING", "READY"], PREPARING: ["READY"], READY: ["SERVED"] };
      if (!allowed[item.status]?.includes(body.status)) throw new ApiError(409, `不可由 ${item.status} 直接改為 ${body.status}`);
      const updated = await tx.restaurantOrderItem.update({ where: { id: item.id }, data: { status: body.status } });
      const ticketIds = item.ticketItems.map((row: any) => row.ticketId);
      for (const ticketId of ticketIds) {
        const ticketItems = await tx.restaurantKitchenTicketItem.findMany({ where: { ticketId }, include: { orderItem: true } });
        const statuses = ticketItems.map((row: any) => row.orderItem.id === item.id ? body.status : row.orderItem.status);
        const ticketStatus = statuses.every((status: string) => status === "SERVED") ? "SERVED"
          : statuses.every((status: string) => ["READY", "SERVED"].includes(status)) ? "READY"
            : statuses.some((status: string) => status === "PREPARING") ? "PREPARING" : "NEW";
        await tx.restaurantKitchenTicket.update({ where: { id: ticketId }, data: { status: ticketStatus, startedAt: ticketStatus === "PREPARING" ? new Date() : undefined, readyAt: ticketStatus === "READY" ? new Date() : undefined, servedAt: ticketStatus === "SERVED" ? new Date() : undefined } });
      }
      const siblings = await tx.restaurantOrderItem.findMany({ where: { orderId: item.orderId, status: { not: "CANCELLED" } }, select: { id: true, status: true } });
      const statuses = siblings.map((row: any) => row.id === item.id ? body.status : row.status);
      const orderStatus = statuses.every((status: string) => ["READY", "SERVED"].includes(status)) ? "READY"
        : statuses.some((status: string) => status === "PREPARING") ? "PREPARING" : "SENT";
      await tx.restaurantOrder.update({ where: { id: item.orderId }, data: { status: orderStatus } });
      return updated;
    });
    return NextResponse.json({ ok: true, item: result });
  }

  if (body.action === "MOVE_TABLE") {
    await prisma.$transaction(async (tx: any) => {
      const order = await tx.restaurantOrder.findFirst({ where: { id: body.orderId, tenantId, status: { in: [...ACTIVE_ORDER_STATUSES] } } });
      if (!order) throw new ApiError(404, "找不到桌單");
      const target = await tx.restaurantTable.findFirst({ where: { id: body.targetTableId, tenantId, isActive: true, status: "AVAILABLE" } });
      if (!target) throw new ApiError(409, "目標桌位不可使用");
      await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
      await tx.restaurantTable.update({ where: { id: target.id }, data: { status: "OCCUPIED" } });
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { tableId: target.id } });
    });
    await audit({ userId: session.user.id, action: "restaurant_move_table", module: "restaurant", refId: body.orderId, detail: body.targetTableId });
    return NextResponse.json({ ok: true });
  }

  const cancelled = await prisma.$transaction(async (tx: any) => {
    const order = await tx.restaurantOrder.findFirst({ where: { id: body.orderId, tenantId, status: { in: [...ACTIVE_ORDER_STATUSES] } } });
    if (!order) throw new ApiError(404, "找不到可取消桌單");
    await tx.restaurantOrderItem.updateMany({ where: { orderId: order.id, status: { not: "SERVED" } }, data: { status: "CANCELLED" } });
    await tx.restaurantKitchenTicket.updateMany({ where: { orderId: order.id, status: { not: "SERVED" } }, data: { status: "CANCELLED" } });
    const updated = await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", note: [order.note, `取消：${body.reason}`].filter(Boolean).join("；"), cancelledAt: new Date() } });
    await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
    return updated;
  });
  await audit({ userId: session.user.id, action: "restaurant_cancel_order", module: "restaurant", refId: cancelled.id, detail: body.reason });
  return NextResponse.json({ ok: true, order: cancelled });
});
