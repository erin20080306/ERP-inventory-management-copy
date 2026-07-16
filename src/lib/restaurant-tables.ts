import { ApiError } from "./api";
import { prisma } from "./prisma";

const ACTIVE_ORDER_STATUSES = ["OPEN", "SENT", "PREPARING", "READY"] as const;

export type RestaurantTableInput = {
  areaId: string;
  code: string;
  name: string;
  seats: number;
  sortOrder: number;
};

function normalized(input: RestaurantTableInput) {
  return {
    areaId: input.areaId,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    seats: input.seats,
    sortOrder: input.sortOrder,
  };
}

async function requireActiveArea(tx: any, tenantId: string, areaId: string) {
  const area = await tx.restaurantArea.findFirst({ where: { id: areaId, tenantId, isActive: true } });
  if (!area) throw new ApiError(404, "找不到可使用的用餐區域");
  return area;
}

async function requireUniqueCode(tx: any, tenantId: string, code: string, exceptId?: string) {
  const duplicate = await tx.restaurantTable.findFirst({
    where: { tenantId, code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, `桌位代碼 ${code} 已存在`);
}

export async function createRestaurantTable(tenantId: string, input: RestaurantTableInput) {
  const data = normalized(input);
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-table-code:${tenantId}:${data.code}`}))`;
    await requireActiveArea(tx, tenantId, data.areaId);
    await requireUniqueCode(tx, tenantId, data.code);
    return tx.restaurantTable.create({ data: { tenantId, ...data } });
  });
}

export async function updateRestaurantTable(tenantId: string, tableId: string, input: RestaurantTableInput) {
  const data = normalized(input);
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-table:${tenantId}:${tableId}`}))`;
    const existing = await tx.restaurantTable.findFirst({ where: { id: tableId, tenantId } });
    if (!existing) throw new ApiError(404, "找不到桌位");
    await requireActiveArea(tx, tenantId, data.areaId);
    await requireUniqueCode(tx, tenantId, data.code, tableId);
    return tx.restaurantTable.update({ where: { id: tableId }, data });
  });
}

export async function setRestaurantTableActive(tenantId: string, tableId: string, isActive: boolean) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-table:${tenantId}:${tableId}`}))`;
    const table = await tx.restaurantTable.findFirst({ where: { id: tableId, tenantId } });
    if (!table) throw new ApiError(404, "找不到桌位");
    if (!isActive) {
      const activeOrder = await tx.restaurantOrder.findFirst({
        where: { tenantId, tableId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        select: { number: true },
      });
      if (activeOrder) throw new ApiError(409, `桌位仍有進行中的桌單 ${activeOrder.number}，不可停用`);
    }
    return tx.restaurantTable.update({
      where: { id: tableId },
      data: { isActive, ...(!isActive ? { status: "AVAILABLE" as const } : {}) },
    });
  });
}

export async function deleteRestaurantTableSafely(tenantId: string, tableId: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-table:${tenantId}:${tableId}`}))`;
    const table = await tx.restaurantTable.findFirst({
      where: { id: tableId, tenantId },
      include: { _count: { select: { orders: true } } },
    });
    if (!table) throw new ApiError(404, "找不到桌位");
    const activeOrder = await tx.restaurantOrder.findFirst({
      where: { tenantId, tableId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
      select: { number: true },
    });
    if (activeOrder) throw new ApiError(409, `桌位仍有進行中的桌單 ${activeOrder.number}，不可刪除`);
    if (table._count.orders > 0) {
      const archived = await tx.restaurantTable.update({
        where: { id: tableId },
        data: { isActive: false, status: "AVAILABLE" },
      });
      return { mode: "ARCHIVED" as const, table: archived };
    }
    const deleted = await tx.restaurantTable.delete({ where: { id: tableId } });
    return { mode: "DELETED" as const, table: deleted };
  });
}
