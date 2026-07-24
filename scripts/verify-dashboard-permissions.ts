import assert from "node:assert/strict";
import { getDashboardVisualStats, getDashboardWorkItems, type DashboardAccess } from "../src/lib/dashboard";

const noAccess: DashboardAccess = {
  sales: false,
  salesApprove: false,
  purchases: false,
  purchasesApprove: false,
  returns: false,
  returnsApprove: false,
  pos: false,
  posApprove: false,
  restaurant: false,
  journals: false,
  journalsApprove: false,
  cashApprove: false,
};

async function main() {
  const work = await getDashboardWorkItems("permission-test-does-not-exist", noAccess);
  assert.deepEqual(work, { items: [], approvalCount: 0, unfinishedCount: 0 });

  const visuals = await getDashboardVisualStats("permission-test-does-not-exist", {
    sales: false,
    purchases: false,
    inventory: false,
  });
  assert.deepEqual(visuals.lowStockList, []);
  assert.deepEqual(visuals.recentSales, []);
  assert.deepEqual(visuals.topProducts, []);
  assert.deepEqual(visuals.salesByStatus, []);
  assert.deepEqual(visuals.inventoryByWarehouse, []);
  assert.equal(visuals.trend.length, 14);
  assert.ok(visuals.trend.every((day) => day.sales === 0 && day.purchase === 0));

  console.log("Dashboard permission isolation verification passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
