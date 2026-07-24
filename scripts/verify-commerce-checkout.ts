import assert from "node:assert/strict";
import {
  allocateCommerceReservationsToStocks,
  planCommerceStockAllocations,
  reservedCommerceQuantityByProduct,
} from "../src/lib/commerce-checkout";
import { salesShipmentRevenueBreakdown } from "../src/lib/documents";

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

const reservations = reservedCommerceQuantityByProduct([
  { productId: "product-a", quantity: 5, shippedQty: 1 },
  { productId: "product-a", quantity: 2, shippedQty: 0 },
  { productId: "product-b", quantity: 3, shippedQty: 3 },
]);
assert.equal(reservations.get("product-a"), 6);
assert.equal(reservations.get("product-b"), 0);

const reservedByStock = allocateCommerceReservationsToStocks([
  { id: "a-wh02", productId: "product-a", quantity: 5, warehouse: { code: "WH02", isActive: true } },
  { id: "a-wh01", productId: "product-a", quantity: 4, warehouse: { code: "WH01", isActive: true } },
  { id: "a-disabled", productId: "product-a", quantity: 99, warehouse: { code: "WH00", isActive: false } },
], reservations);
assert.equal(reservedByStock.get("a-wh01"), 4);
assert.equal(reservedByStock.get("a-wh02"), 2);
assert.equal(reservedByStock.get("a-disabled"), 0);

assert.deepEqual(
  salesShipmentRevenueBreakdown({ subtotal: 1_680, discount: 0, taxAmount: 0, total: 1_800 }),
  { merchandiseRevenue: 1_680, shippingRevenue: 120 },
);
assert.deepEqual(
  salesShipmentRevenueBreakdown({ subtotal: 2_280, discount: 0, taxAmount: 0, total: 2_280 }),
  { merchandiseRevenue: 2_280, shippingRevenue: 0 },
);

console.log("Commerce checkout stock reservation planning verified.");
