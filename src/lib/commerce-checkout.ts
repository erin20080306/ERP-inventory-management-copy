export type CommerceStockRow = {
  id: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseActive: boolean;
  quantity: number;
};

export type CommerceStockRequest = {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  stocks: CommerceStockRow[];
};

export type CommerceStockAllocation = {
  stockId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
};

export type OpenCommerceOrderLine = {
  productId: string;
  quantity: unknown;
  shippedQty: unknown;
};

export function reservedCommerceQuantityByProduct(lines: OpenCommerceOrderLine[]) {
  const reserved = new Map<string, number>();
  for (const line of lines) {
    const open = Math.max(0, Number(line.quantity) - Number(line.shippedQty));
    reserved.set(line.productId, (reserved.get(line.productId) ?? 0) + open);
  }
  return reserved;
}

export function allocateCommerceReservationsToStocks(
  stocks: Array<{
    id: string;
    productId: string;
    quantity: unknown;
    warehouse: { code: string; isActive: boolean };
  }>,
  reservedByProduct: Map<string, number>,
) {
  const reservedByStock = new Map<string, number>();
  const grouped = new Map<string, typeof stocks>();
  for (const stock of stocks) {
    const rows = grouped.get(stock.productId) ?? [];
    rows.push(stock);
    grouped.set(stock.productId, rows);
  }

  for (const [productId, productStocks] of grouped) {
    let remaining = reservedByProduct.get(productId) ?? 0;
    const ordered = [...productStocks].sort((left, right) => {
      if (left.warehouse.code === "WH01" && right.warehouse.code !== "WH01") return -1;
      if (right.warehouse.code === "WH01" && left.warehouse.code !== "WH01") return 1;
      return left.warehouse.code.localeCompare(right.warehouse.code) || left.id.localeCompare(right.id);
    });
    for (const stock of ordered) {
      if (!stock.warehouse.isActive || remaining <= 0) {
        reservedByStock.set(stock.id, 0);
        continue;
      }
      const allocated = Math.min(Math.max(0, Number(stock.quantity)), remaining);
      reservedByStock.set(stock.id, allocated);
      remaining = Math.max(0, remaining - allocated);
    }
  }
  return reservedByStock;
}

export function planCommerceStockAllocations(requests: CommerceStockRequest[]) {
  const allocations: CommerceStockAllocation[] = [];
  const shortages: Array<{ productId: string; productName: string; available: number; requested: number }> = [];

  for (const request of requests) {
    let remaining = request.quantity;
    const activeStocks = request.stocks
      .filter((stock) => stock.warehouseActive && stock.quantity > 0)
      .sort((left, right) => {
        if (left.warehouseCode === "WH01" && right.warehouseCode !== "WH01") return -1;
        if (right.warehouseCode === "WH01" && left.warehouseCode !== "WH01") return 1;
        return left.warehouseCode.localeCompare(right.warehouseCode) || left.id.localeCompare(right.id);
      });
    const available = activeStocks.reduce((sum, stock) => sum + stock.quantity, 0);

    for (const stock of activeStocks) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, stock.quantity);
      allocations.push({
        stockId: stock.id,
        productId: request.productId,
        warehouseId: stock.warehouseId,
        quantity,
        unitCost: request.unitCost,
      });
      remaining = Math.round((remaining - quantity) * 10_000) / 10_000;
    }

    if (remaining > 0) {
      shortages.push({
        productId: request.productId,
        productName: request.productName,
        available,
        requested: request.quantity,
      });
    }
  }

  const cogs = Math.round(
    allocations.reduce((sum, allocation) => sum + allocation.quantity * allocation.unitCost, 0) * 100,
  ) / 100;
  const warehouseIds = [...new Set(allocations.map((allocation) => allocation.warehouseId))];
  return {
    allocations,
    shortages,
    cogs,
    orderWarehouseId: warehouseIds.length === 1 ? warehouseIds[0] : null,
  };
}
