import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign as cryptoSign } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as issueLicenseLease } from "../src/app/api/license/lease/route";
import { prisma } from "../src/lib/prisma";
import { receivePurchaseOrder } from "../src/lib/documents";
import {
  activateTenantLicense,
  fingerprintDeviceId,
  getLicenseAccessForUser,
  hashDeviceId,
  invalidateLicenseAccessCache,
  signOfflineLease,
  verifyLocalWorkstationRequest,
  verifyLicenseEventChain,
  verifyOfflineLease,
  workstationDeviceIdFromPublicKey,
  workstationProofMaterial,
} from "../src/lib/license";
import { refundPosSale } from "../src/lib/pos-refunds";
import { seedTenantDefaults } from "../src/lib/seed-tenant";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("請設定 DATABASE_URL");
const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
if (!/^erp_resilience_test_[a-z0-9_]+$/.test(databaseName)) {
  throw new Error(`只允許在 erp_resilience_test_* 測試資料庫執行，目前為 ${databaseName}`);
}

const keys = generateKeyPairSync("ed25519");
process.env.LICENSE_ED25519_PRIVATE_KEY_B64 = keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
process.env.LICENSE_ED25519_PUBLIC_KEY_B64 = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
process.env.LICENSE_KEY_SECRET = "resilience-key-secret-at-least-32-characters";
process.env.LICENSE_DEVICE_SECRET = "resilience-device-secret-at-least-32-characters";
process.env.LICENSE_AUDIT_SECRET = "resilience-audit-secret-at-least-32-characters";
process.env.INTEGRITY_SECRET = "resilience-integrity-secret-at-least-32-characters";

async function testConcurrentFulfillment() {
  const tenant = await prisma.tenant.create({ data: { name: "併發進貨測試" } });
  await seedTenantDefaults(tenant.id);
  const [warehouse, supplier, product] = await Promise.all([
    prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id, code: "WH01" } }),
    prisma.supplier.create({ data: { tenantId: tenant.id, code: "SUP-RACE", companyName: "併發供應商" } }),
    prisma.product.create({ data: { tenantId: tenant.id, sku: "RACE-SKU", name: "併發商品", costPrice: 50, salePrice: 100 } }),
  ]);

  const validOrder = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      number: "PO-RACE-VALID",
      supplierId: supplier.id,
      status: "APPROVED",
      subtotal: 1000,
      taxAmount: 50,
      total: 1050,
      items: { create: { productId: product.id, quantity: 10, unitPrice: 100, taxRate: 0.05, subtotal: 1000 } },
    },
    include: { items: true },
  });
  const validResults = await Promise.all([
    receivePurchaseOrder(validOrder.id, warehouse.id, tenant.id, [{ orderItemId: validOrder.items[0].id, quantity: 4 }]),
    receivePurchaseOrder(validOrder.id, warehouse.id, tenant.id, [{ orderItemId: validOrder.items[0].id, quantity: 6 }]),
  ]);
  assert.equal(validResults.filter((result) => result.complete).length, 1);
  assert.equal((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: validOrder.id } })).status, "POSTED");
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
  })).quantity), 10);

  const overOrder = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      number: "PO-RACE-OVER",
      supplierId: supplier.id,
      status: "APPROVED",
      subtotal: 1000,
      taxAmount: 50,
      total: 1050,
      items: { create: { productId: product.id, quantity: 10, unitPrice: 100, taxRate: 0.05, subtotal: 1000 } },
    },
    include: { items: true },
  });
  const overResults = await Promise.allSettled([
    receivePurchaseOrder(overOrder.id, warehouse.id, tenant.id, [{ orderItemId: overOrder.items[0].id, quantity: 7 }]),
    receivePurchaseOrder(overOrder.id, warehouse.id, tenant.id, [{ orderItemId: overOrder.items[0].id, quantity: 7 }]),
  ]);
  assert.equal(overResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(overResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await prisma.purchaseReceipt.count({ where: { orderId: overOrder.id } }), 1);
  assert.equal(Number((await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: overOrder.items[0].id } })).receivedQty), 7);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
  })).quantity), 17);
}

async function testConcurrentPosRefund() {
  const tenant = await prisma.tenant.create({ data: { name: "POS 併發退款測試", businessMode: "POS" } });
  await seedTenantDefaults(tenant.id);
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id, code: "WH01" } });
  const register = await prisma.posRegister.findFirstOrThrow({ where: { tenantId: tenant.id, code: "POS01" } });
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, username: `pos-race-${tenant.id}`, email: `pos-race-${tenant.id}@example.invalid`, name: "POS 併發測試員", passwordHash: "not-a-real-password" },
  });
  const shift = await prisma.posShift.create({ data: { tenantId: tenant.id, registerId: register.id, userId: user.id, openingCash: 1000 } });
  const product = await prisma.product.create({ data: { tenantId: tenant.id, sku: "POS-RACE", name: "POS 併發商品", costPrice: 50, salePrice: 105 } });
  await prisma.inventoryStock.create({ data: { tenantId: tenant.id, productId: product.id, warehouseId: warehouse.id, quantity: 5 } });
  const sale = await prisma.posSale.create({
    data: {
      tenantId: tenant.id,
      shiftId: shift.id,
      registerId: register.id,
      number: "POS-RACE-SALE",
      subtotal: 500,
      taxAmount: 25,
      total: 525,
      paidAmount: 525,
      items: { create: { productId: product.id, quantity: 5, unitPrice: 105, unitCost: 50, taxRate: 0.05, subtotal: 525 } },
      payments: { create: { method: "CASH", amount: 525 } },
    },
    include: { items: true },
  });
  const results = await Promise.allSettled([
    refundPosSale({ tenantId: tenant.id, userId: user.id, shiftId: shift.id, saleId: sale.id, reason: "併發退款 A", items: [{ saleItemId: sale.items[0].id, quantity: 4 }] }),
    refundPosSale({ tenantId: tenant.id, userId: user.id, shiftId: shift.id, saleId: sale.id, reason: "併發退款 B", items: [{ saleItemId: sale.items[0].id, quantity: 4 }] }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await prisma.posRefund.count({ where: { saleId: sale.id } }), 1);
  assert.equal(Number((await prisma.posSaleItem.findUniqueOrThrow({ where: { id: sale.items[0].id } })).returnedQty), 4);
  assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
    where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
  })).quantity), 9);
}

function createWorkstationIdentity() {
  const keyPair = generateKeyPairSync("ed25519");
  const publicKey = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return { keyPair, publicKey, deviceId: workstationDeviceIdFromPublicKey(publicKey) };
}

async function requestLease(
  activationKey: string,
  identity: ReturnType<typeof createWorkstationIdentity>,
  ip: string,
) {
  const request = new NextRequest("http://central.example.invalid/api/license/lease", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({
      activationKey,
      deviceId: identity.deviceId,
      deviceRole: "WORKSTATION",
      devicePublicKey: identity.publicKey,
      displayName: identity.deviceId,
      platform: "linux",
      appVersion: "test",
    }),
  });
  const response = await issueLicenseLease(request);
  return { status: response.status, body: await response.json() };
}

async function requestServerLease(activationKey: string, deviceId: string, ip: string) {
  const request = new NextRequest("http://central.example.invalid/api/license/lease", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ activationKey, deviceId, deviceRole: "SERVER", displayName: deviceId, platform: "linux", appVersion: "test" }),
  });
  const response = await issueLicenseLease(request);
  return { status: response.status, body: await response.json() };
}

async function testCentralSeatAndSignature() {
  const tenant = await prisma.tenant.create({ data: { name: "中央席次測試" } });
  const actor = await prisma.user.create({
    data: { tenantId: tenant.id, username: `license-actor-${tenant.id}`, email: `license-actor-${tenant.id}@example.invalid`, name: "授權測試員", passwordHash: "not-a-real-password" },
  });
  const activation = await activateTenantLicense({
    tenantId: tenant.id,
    planCode: "TEAM_2",
    billing: "ONCE",
    actorUserId: actor.id,
    payment: { paidAmount: 20_000, paidAt: new Date(), paymentMethod: "BANK_TRANSFER", paymentReference: `TEST-${tenant.id}` },
  });
  assert.ok(activation.activationKey);
  const identities = [createWorkstationIdentity(), createWorkstationIdentity(), createWorkstationIdentity()];
  const responses = await Promise.all(identities.map((identity, index) => requestLease(activation.activationKey!, identity, `10.0.0.${index + 1}`)));
  assert.deepEqual(responses.map((response) => response.status).sort((a, b) => a - b), [200, 200, 409]);
  assert.equal(await prisma.licenseDevice.count({ where: { tenantId: tenant.id, deviceRole: "WORKSTATION", revokedAt: null } }), 2);

  const serverResponses = await Promise.all([
    requestServerLease(activation.activationKey!, "company-server-alpha", "10.0.1.1"),
    requestServerLease(activation.activationKey!, "company-server-beta", "10.0.1.2"),
  ]);
  assert.deepEqual(serverResponses.map((response) => response.status).sort((a, b) => a - b), [200, 409]);
  assert.equal(await prisma.licenseDevice.count({ where: { tenantId: tenant.id, deviceRole: "SERVER", revokedAt: null } }), 1);
  assert.equal(await prisma.licenseDevice.count({ where: { tenantId: tenant.id, deviceRole: "WORKSTATION", revokedAt: null } }), 2);

  const successfulIndex = responses.findIndex((response) => response.status === 200);
  const successful = responses[successfulIndex];
  assert.equal(successful.body.lease.algorithm, "ed25519");
  assert.equal(verifyOfflineLease(successful.body.lease), true);
  assert.equal(successful.body.lease.payload.deviceRole, "WORKSTATION");
  assert.equal(successful.body.lease.payload.deviceFingerprint, fingerprintDeviceId(identities[successfulIndex].deviceId));
  const leaseHours = (new Date(successful.body.lease.payload.expiresAt).getTime() - new Date(successful.body.lease.payload.issuedAt).getTime()) / 3_600_000;
  assert.equal(leaseHours, 24);
  assert.equal(verifyOfflineLease({ ...successful.body.lease, payload: { ...successful.body.lease.payload, seatLimit: 999 } }), false);

  const renewed = await requestLease(activation.activationKey!, identities[successfulIndex], "10.0.0.20");
  assert.equal(renewed.status, 200);
  assert.equal(await prisma.licenseDevice.count({ where: { tenantId: tenant.id, deviceRole: "WORKSTATION", revokedAt: null } }), 2);

  const device = await prisma.licenseDevice.findUniqueOrThrow({
    where: { tenantId_deviceHash: { tenantId: tenant.id, deviceHash: hashDeviceId(identities[successfulIndex].deviceId) } },
  });
  await prisma.licenseDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
  const revoked = await requestLease(activation.activationKey!, identities[successfulIndex], "10.0.0.21");
  assert.equal(revoked.status, 403);
  const chain = await verifyLicenseEventChain(tenant.id);
  assert.equal(chain.valid, true);

  const privateKey = process.env.LICENSE_ED25519_PRIVATE_KEY_B64;
  delete process.env.LICENSE_ED25519_PRIVATE_KEY_B64;
  assert.throws(() => signOfflineLease({ issuedAt: new Date().toISOString() }), /缺少 Ed25519 私鑰/);
  process.env.LICENSE_ED25519_PRIVATE_KEY_B64 = privateKey;
}

async function testLocalOfflineLease() {
  process.env.LOCAL_LICENSE_MODE = "true";
  process.env.CENTRAL_LICENSE_URL = "http://127.0.0.1:1";
  process.env.LOCAL_ACTIVATION_KEY = "ERP-local-test-activation-key-123456789";
  process.env.LOCAL_DEVICE_ID = "local-device-alpha";

  const tenant = await prisma.tenant.create({ data: { name: "本機離線租約測試" } });
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, username: `local-license-${tenant.id}`, email: `local-license-${tenant.id}@example.invalid`, name: "本機授權測試員", passwordHash: "not-a-real-password", isSuperAdmin: true },
  });
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 24 * 60 * 60_000);
  const payload = {
    tenantId: "remote-tenant-alpha",
    tenantName: "中央客戶公司",
    businessMode: "ERP",
    deviceId: "remote-device-record-alpha",
    deviceFingerprint: fingerprintDeviceId(process.env.LOCAL_DEVICE_ID),
    deviceRole: "SERVER",
    planCode: "TEAM_2",
    seatLimit: 2,
    licenseVersion: 1,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const signed = signOfflineLease(payload);
  await prisma.offlineLicenseLease.create({
    data: {
      tenantId: tenant.id,
      remoteTenantId: payload.tenantId,
      payload,
      signature: signed.signature,
      algorithm: signed.algorithm,
      issuedAt,
      expiresAt,
      checkedAt: new Date(),
      lastObservedAt: new Date(),
    },
  });

  let access = await getLicenseAccessForUser(user.id);
  assert.equal(access.allowed, true);
  assert.equal(access.seatLimit, 2);

  const workstation = createWorkstationIdentity();
  const workstationPayload = {
    ...payload,
    deviceId: "remote-workstation-record",
    deviceRole: "WORKSTATION",
    devicePublicKey: workstation.publicKey,
    deviceFingerprint: fingerprintDeviceId(workstation.deviceId),
  };
  const workstationLease = signOfflineLease(workstationPayload);
  const timestamp = String(Date.now());
  const nonce = randomBytes(18).toString("base64url");
  const path = "/api/products?page=1";
  const proof = cryptoSign(null, Buffer.from(workstationProofMaterial({
    deviceFingerprint: workstationPayload.deviceFingerprint,
    method: "GET",
    path,
    timestamp,
    nonce,
  })), workstation.keyPair.privateKey).toString("base64url");
  const proofHeaders = new Headers({
    "x-erin-workstation-lease": Buffer.from(JSON.stringify(workstationLease)).toString("base64url"),
    "x-erin-workstation-time": timestamp,
    "x-erin-workstation-nonce": nonce,
    "x-erin-workstation-proof": proof,
  });
  let workstationAccess = await verifyLocalWorkstationRequest(tenant.id, { method: "GET", path, headers: proofHeaders });
  assert.equal(workstationAccess.allowed, true);
  workstationAccess = await verifyLocalWorkstationRequest(tenant.id, { method: "GET", path, headers: proofHeaders });
  assert.equal(workstationAccess.allowed, false);
  assert.match(workstationAccess.reason ?? "", /重複/);

  const attacker = generateKeyPairSync("ed25519");
  const attackerNonce = randomBytes(18).toString("base64url");
  const attackerProof = cryptoSign(null, Buffer.from(workstationProofMaterial({
    deviceFingerprint: workstationPayload.deviceFingerprint,
    method: "GET",
    path,
    timestamp,
    nonce: attackerNonce,
  })), attacker.privateKey).toString("base64url");
  const attackerHeaders = new Headers({
    "x-erin-workstation-lease": Buffer.from(JSON.stringify(workstationLease)).toString("base64url"),
    "x-erin-workstation-time": timestamp,
    "x-erin-workstation-nonce": attackerNonce,
    "x-erin-workstation-proof": attackerProof,
  });
  workstationAccess = await verifyLocalWorkstationRequest(tenant.id, { method: "GET", path, headers: attackerHeaders });
  assert.equal(workstationAccess.allowed, false);
  assert.match(workstationAccess.reason ?? "", /簽章無效/);

  process.env.LOCAL_DEVICE_ID = "copied-to-other-device";
  invalidateLicenseAccessCache(tenant.id);
  access = await getLicenseAccessForUser(user.id);
  assert.equal(access.allowed, false);
  assert.match(access.reason ?? "", /不屬於此電腦/);
  process.env.LOCAL_DEVICE_ID = "local-device-alpha";

  await prisma.offlineLicenseLease.update({ where: { tenantId: tenant.id }, data: { expiresAt: new Date(expiresAt.getTime() + 365 * 24 * 60 * 60_000), checkedAt: new Date() } });
  invalidateLicenseAccessCache(tenant.id);
  access = await getLicenseAccessForUser(user.id);
  assert.equal(access.allowed, false);
  assert.match(access.reason ?? "", /中央簽章不一致/);

  await prisma.offlineLicenseLease.update({ where: { tenantId: tenant.id }, data: { expiresAt, signature: `${signed.signature.startsWith("A") ? "B" : "A"}${signed.signature.slice(1)}`, checkedAt: new Date() } });
  invalidateLicenseAccessCache(tenant.id);
  access = await getLicenseAccessForUser(user.id);
  assert.equal(access.allowed, false);
  assert.match(access.reason ?? "", /簽章驗證失敗/);

  await prisma.offlineLicenseLease.update({ where: { tenantId: tenant.id }, data: { signature: signed.signature, lastObservedAt: new Date(Date.now() + 10 * 60_000), checkedAt: new Date() } });
  invalidateLicenseAccessCache(tenant.id);
  access = await getLicenseAccessForUser(user.id);
  assert.equal(access.allowed, false);
  assert.match(access.reason ?? "", /時間回撥/);

  const expiredIssuedAt = new Date(Date.now() - 25 * 60 * 60_000);
  const expiredAt = new Date(Date.now() - 60 * 60_000);
  const expiredPayload = { ...payload, issuedAt: expiredIssuedAt.toISOString(), expiresAt: expiredAt.toISOString() };
  const expiredSigned = signOfflineLease(expiredPayload);
  await prisma.offlineLicenseLease.update({
    where: { tenantId: tenant.id },
    data: {
      payload: expiredPayload,
      signature: expiredSigned.signature,
      issuedAt: expiredIssuedAt,
      expiresAt: expiredAt,
      checkedAt: new Date(),
      lastObservedAt: new Date(),
    },
  });
  invalidateLicenseAccessCache(tenant.id);
  access = await getLicenseAccessForUser(user.id);
  assert.equal(access.allowed, false);
  assert.match(access.reason ?? "", /離線授權租約已到期/);
}

async function main() {
  await testConcurrentFulfillment();
  await testConcurrentPosRefund();
  await testCentralSeatAndSignature();
  await testLocalOfflineLease();
  process.stdout.write(`${JSON.stringify({
    ok: true,
    concurrentPartialFulfillment: true,
    oversubscriptionBlocked: true,
    concurrentPosOverRefundBlocked: true,
    twoSeatLimitAtomic: true,
    oneServerSeparateFromSeats: true,
    workstationPrivateKeyRequired: true,
    workstationReplayBlocked: true,
    localSuperadminCannotBypassLicense: true,
    ed25519Required: true,
    leaseHours: 24,
    copiedLeaseBlocked: true,
    databaseDateTamperBlocked: true,
    signatureTamperBlocked: true,
    clockRollbackBlocked: true,
    expiredOfflineLeaseBlocked: true,
  }, null, 2)}\n`);
}

main().finally(async () => prisma.$disconnect());
