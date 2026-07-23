import assert from "node:assert/strict";
import { planCommerceStockAllocations } from "../src/lib/commerce-checkout";

const result = planCommerceStockAllocations([
  {
    productId: "product-a",
    productName: "商品 A",
    quantity: 6,
    unitCost: 80,
    stocks: [
      { id: "stock-2", warehouseId: "warehouse-2", warehouseCode: "WH02", warehouseActive: true, quantity: 4 },
      { id: "stock-1", warehouseId: "warehouse-1", warehouseCode: "WH01", warehouseActive: true, quantity: 3 },
    ],
  },
  {
    productId: "product-b",
    productName: "商品 B",
    quantity: 2,
    unitCost: 50,
    stocks: [
      { id: "stock-3", warehouseId: "warehouse-1", warehouseCode: "WH01", warehouseActive: true, quantity: 2 },
    ],
  },
]);

assert.deepEqual(result.shortages, []);
assert.deepEqual(result.allocations.map((allocation) => [allocation.stockId, allocation.quantity]), [
  ["stock-1", 3],
  ["stock-2", 3],
  ["stock-3", 2],
]);
assert.equal(result.cogs, 580);
assert.equal(result.orderWarehouseId, null);

const shortage = planCommerceStockAllocations([{
  productId: "product-c",
  productName: "商品 C",
  quantity: 5,
  unitCost: 20,
  stocks: [
    { id: "stock-inactive", warehouseId: "warehouse-3", warehouseCode: "WH03", warehouseActive: false, quantity: 99 },
    { id: "stock-active", warehouseId: "warehouse-1", warehouseCode: "WH01", warehouseActive: true, quantity: 2 },
  ],
}]);

assert.equal(shortage.shortages.length, 1);
assert.equal(shortage.shortages[0].available, 2);
assert.equal(shortage.shortages[0].requested, 5);

console.log("Commerce checkout allocation and cost posting verified.");
