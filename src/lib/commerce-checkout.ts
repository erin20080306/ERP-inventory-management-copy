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
