import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { computeLicenseAccess } from "../src/lib/license";
import { normalizeBusinessMode } from "../src/lib/product-editions";

const expected = [
  { username: "demo-erp", mode: "ERP", status: "paid", billing: "ANNUAL", payments: 1 },
  { username: "demo-retail", mode: "POS_RETAIL", status: "paid", billing: "MONTHLY", payments: 1 },
  { username: "demo-food", mode: "POS_RESTAURANT", status: "paid", billing: "ONCE", payments: 1 },
  { username: "demo-trial", mode: "ERP", status: "trial", billing: null, payments: 0 },
  { username: "demo-expired", mode: "POS_RETAIL", status: "expired", billing: null, payments: 0 },
  { username: "demo-revoked", mode: "ERP", status: "locked", billing: "MONTHLY", payments: 1 },
] as const;

async function main() {
  for (const item of expected) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: item.username },
      include: { tenant: { include: { _count: { select: { licensePayments: true } } } } },
    });
    assert.ok(user.tenant);
    assert.equal(normalizeBusinessMode(user.tenant!.businessMode), item.mode);
    assert.equal(user.tenant!._count.licensePayments, item.payments);
    const access = computeLicenseAccess({
      tenantCreatedAt: user.tenant!.createdAt,
      licensePlan: user.tenant!.licensePlan,
      licenseBilling: user.tenant!.licenseBilling,
      licenseStatus: user.tenant!.licenseStatus,
      licenseSeatLimit: user.tenant!.licenseSeatLimit,
      licenseActivatedAt: user.tenant!.licenseActivatedAt,
      licenseExpiresAt: user.tenant!.licenseExpiresAt,
      licenseKeyHash: user.tenant!.licenseKeyHash,
      licenseVersion: user.tenant!.licenseVersion,
      legacyIsPaid: user.isPaid,
      legacyPaymentType: user.paymentType,
      legacySubscriptionEnd: user.subscriptionEnd,
    });
    assert.equal(access.status, item.status);
    assert.equal(user.tenant!.licenseBilling, item.billing);
  }

  const restaurant = await prisma.user.findUniqueOrThrow({ where: { username: "demo-food" }, select: { tenantId: true } });
  assert.ok(restaurant.tenantId);
  assert.equal(await prisma.product.count({ where: { tenantId: restaurant.tenantId!, imageUrl: { not: null } } }), 6);
  assert.equal(await prisma.restaurantTable.count({ where: { tenantId: restaurant.tenantId!, isActive: true } }), 8);

  const retail = await prisma.user.findUniqueOrThrow({ where: { username: "demo-retail" }, select: { tenantId: true } });
  assert.ok(retail.tenantId);
  assert.equal(await prisma.product.count({ where: { tenantId: retail.tenantId!, barcode: { not: null } } }), 3);

  console.log("Six demo customer lifecycle states and ERP/POS fixtures: PASS");
}

main().finally(() => prisma.$disconnect());
