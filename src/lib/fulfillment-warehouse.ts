import { prisma } from "./prisma";
import type { FulfillmentItemInput } from "./documents";

const QTY_EPSILON = 0.00001;

type WarehouseSummary = {
  id: string;
  code: string;
  name: string;
};

type ProductRequirement = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
};

export type SalesFulfillmentWarehouseResolution = {
  warehouseId: string;
  warehouse: WarehouseSummary;
  requestedWarehouse: WarehouseSummary;
  autoSelected: boolean;
};

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export async function resolveSalesFulfillmentWarehouse(input: {
  tenantId: string;
  orderId: string;
  requestedWarehouseId: string;
  requestedItems?: FulfillmentItemInput[];
}): Promise<SalesFulfillmentWarehouseResolution> {
  const order = await prisma.salesOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: {
      warehouseId: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          shippedQty: true,
          product: { select: { sku: true, name: true } },
        },
      },
    },
  });
  if (!order) throw new Error("找不到銷售單");

  const itemById = new Map(order.items.map((item) => [item.id, item]));
  const selectedInputs = input.requestedItems === undefined
    ? order.items.map((item) => ({
        orderItemId: item.id,
        quantity: roundQuantity(Number(item.quantity) - Number(item.shippedQty)),
      })).filter((item) => item.quantity > QTY_EPSILON)
    : input.requestedItems;

  const seen = new Set<string>();
  const requirementsByProduct = new Map<string, ProductRequirement>();
  for (const selected of selectedInputs) {
    if (seen.has(selected.orderItemId)) throw new Error("本次明細不可重複");
    seen.add(selected.orderItemId);
    const orderItem = itemById.get(selected.orderItemId);
    if (!orderItem) throw new Error("本次明細不屬於此訂單");

    const quantity = roundQuantity(Number(selected.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("本次數量必須大於 0");
    const remaining = roundQuantity(Number(orderItem.quantity) - Number(orderItem.shippedQty));
    if (quantity - remaining > QTY_EPSILON) {
      throw new Error(`商品 ${orderItem.product.sku} 本次數量超過未交量 ${remaining}`);
    }

    const previous = requirementsByProduct.get(orderItem.productId);
    requirementsByProduct.set(orderItem.productId, {
      productId: orderItem.productId,
      sku: orderItem.product.sku,
      name: orderItem.product.name,
      quantity: roundQuantity((previous?.quantity ?? 0) + quantity),
    });
  }
  const requirements = [...requirementsByProduct.values()];
  if (!requirements.length) throw new Error("請至少輸入一筆本次數量");

  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId: input.tenantId, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const requestedWarehouse = warehouses.find((warehouse) => warehouse.id === input.requestedWarehouseId);
  if (!requestedWarehouse) throw new Error("找不到可用的出貨倉庫");

  const stocks = await prisma.inventoryStock.findMany({
    where: {
      tenantId: input.tenantId,
      warehouseId: { in: warehouses.map((warehouse) => warehouse.id) },
      productId: { in: requirements.map((requirement) => requirement.productId) },
    },
    select: { warehouseId: true, productId: true, quantity: true },
  });
  const stockByWarehouse = new Map<string, Map<string, number>>();
  for (const stock of stocks) {
    const byProduct = stockByWarehouse.get(stock.warehouseId) ?? new Map<string, number>();
    byProduct.set(stock.productId, Number(stock.quantity));
    stockByWarehouse.set(stock.warehouseId, byProduct);
  }

  const shortagesFor = (warehouseId: string) => requirements.flatMap((requirement) => {
    const available = stockByWarehouse.get(warehouseId)?.get(requirement.productId) ?? 0;
    return available + QTY_EPSILON < requirement.quantity
      ? [{ ...requirement, available }]
      : [];
  });

  if (shortagesFor(requestedWarehouse.id).length === 0) {
    return {
      warehouseId: requestedWarehouse.id,
      warehouse: requestedWarehouse,
      requestedWarehouse,
      autoSelected: false,
    };
  }

  const candidates: WarehouseSummary[] = [];
  const addCandidate = (warehouse: WarehouseSummary | undefined) => {
    if (!warehouse || warehouse.id === requestedWarehouse.id || candidates.some((item) => item.id === warehouse.id)) return;
    candidates.push(warehouse);
  };
  addCandidate(warehouses.find((warehouse) => warehouse.id === order.warehouseId));
  addCandidate(warehouses.find((warehouse) => warehouse.code === "WH01"));
  warehouses.forEach(addCandidate);

  const fallback = candidates.find((warehouse) => shortagesFor(warehouse.id).length === 0);
  if (fallback) {
    return {
      warehouseId: fallback.id,
      warehouse: fallback,
      requestedWarehouse,
      autoSelected: true,
    };
  }

  const shortageText = shortagesFor(requestedWarehouse.id)
    .map((shortage) => `${shortage.sku}（需要 ${shortage.quantity}、現有 ${roundQuantity(shortage.available)}）`)
    .join("；");
  throw new Error(
    `${requestedWarehouse.code} - ${requestedWarehouse.name} 庫存不足：${shortageText}。其他啟用倉庫也沒有足夠庫存，請先調撥或入庫後再出貨`,
  );
}
