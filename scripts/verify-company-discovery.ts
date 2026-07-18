import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST as discover } from "../src/app/api/license/discover/route";
import { POST as lease } from "../src/app/api/license/lease/route";
import { POST as registerServer } from "../src/app/api/license/register-server/route";
import {
  activateTenantLicense,
  refreshLocalLicenseLease,
  verifyLicensePaymentRecords,
  verifyOfflineLease,
  workstationDeviceIdFromPublicKey,
} from "../src/lib/license";
import { prisma } from "../src/lib/prisma";
import { seedTenantDefaults } from "../src/lib/seed-tenant";

const signingKeys = generateKeyPairSync("ed25519");
process.env.LICENSE_KEY_SECRET ||= randomBytes(32).toString("hex");
process.env.LICENSE_DEVICE_SECRET ||= randomBytes(32).toString("hex");
process.env.LICENSE_AUDIT_SECRET ||= randomBytes(32).toString("hex");
process.env.LICENSE_ED25519_PRIVATE_KEY_B64 = signingKeys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
process.env.LICENSE_ED25519_PUBLIC_KEY_B64 = signingKeys.publicKey.export({ format: "der", type: "spki" }).toString("base64");

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": `test-${randomBytes(5).toString("hex")}` },
    body: JSON.stringify(body),
  });
}

function workstation() {
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return { devicePublicKey: publicKey, deviceId: workstationDeviceIdFromPublicKey(publicKey) };
}

async function deleteLocalFixture(tenantId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.restaurantOrder.deleteMany({ where: { tenantId } });
    await tx.posShift.deleteMany({ where: { tenantId } });
    await tx.restaurantTable.deleteMany({ where: { tenantId } });
    await tx.restaurantArea.deleteMany({ where: { tenantId } });
    await tx.posRegister.deleteMany({ where: { tenantId } });
    await tx.salesOrder.deleteMany({ where: { tenantId } });
    await tx.purchaseOrder.deleteMany({ where: { tenantId } });
    await tx.inventoryStock.deleteMany({ where: { tenantId } });
    await tx.inventoryTransaction.deleteMany({ where: { tenantId } });
    await tx.product.deleteMany({ where: { tenantId } });
    await tx.productCategory.deleteMany({ where: { tenantId } });
    await tx.productUnit.deleteMany({ where: { tenantId } });
    await tx.customer.deleteMany({ where: { tenantId } });
    await tx.supplier.deleteMany({ where: { tenantId } });
    await tx.cashAccount.deleteMany({ where: { tenantId } });
    await tx.bankAccount.deleteMany({ where: { tenantId } });
    await tx.warehouse.deleteMany({ where: { tenantId } });
    await tx.chartOfAccount.deleteMany({ where: { tenantId } });
    await tx.taxRate.deleteMany({ where: { tenantId } });
    await tx.numberSequence.deleteMany({ where: { tenantId } });
    await tx.companySetting.deleteMany({ where: { tenantId } });
    await tx.offlineLicenseLease.deleteMany({ where: { tenantId } });
    await tx.licensePayment.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "erin-erp-discovery-"));
  let tenantId = "";
  let localTenantId = "";
  const originalFetch = globalThis.fetch;
  const originalLocalEnv = {
    CENTRAL_LICENSE_URL: process.env.CENTRAL_LICENSE_URL,
    LOCAL_ACTIVATION_KEY: process.env.LOCAL_ACTIVATION_KEY,
    LOCAL_DEVICE_ID: process.env.LOCAL_DEVICE_ID,
    LOCAL_DEVICE_NAME: process.env.LOCAL_DEVICE_NAME,
  };

  try {
  const certPath = join(tempDir, "ca.crt");
  const keyPath = join(tempDir, "ca.key");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=Erin ERP Discovery Test CA",
    "-keyout", keyPath,
    "-out", certPath,
  ], { stdio: "ignore" });
  const caCertificate = readFileSync(certPath, "utf8");

  const tenant = await prisma.tenant.create({ data: { name: `公司代碼測試-${Date.now()}`, businessMode: "POS_RESTAURANT" } });
  tenantId = tenant.id;
  const activation = await activateTenantLicense({
    tenantId,
    planCode: "TEAM_2",
    billing: "MONTHLY",
    actorUserId: "automated-discovery-test",
    payment: { paidAmount: 699, paidAt: new Date(), paymentMethod: "BANK_TRANSFER", paymentReference: `DISCOVERY-${tenantId}` },
  });
  assert.ok(activation.activationKey);
  assert.match(activation.companyCode, /^ERIN-[A-F0-9]{12}$/);
  assert.deepEqual(await verifyLicensePaymentRecords(tenantId), { valid: true, checked: 1 });
  await assert.rejects(() => activateTenantLicense({
    tenantId,
    planCode: "TEAM_2",
    billing: "MONTHLY",
    actorUserId: "automated-discovery-test",
    payment: { paidAmount: 699, paidAt: new Date(), paymentMethod: "BANK_TRANSFER", paymentReference: `DISCOVERY-${tenantId}` },
  }), /重複入帳/);
  assert.equal(await prisma.licensePayment.count({ where: { tenantId } }), 1);

  const serverDeviceId = `server-${randomBytes(18).toString("base64url")}`;
  const serverLeaseResponse = await lease(request("/api/license/lease", {
    activationKey: activation.activationKey,
    deviceId: serverDeviceId,
    deviceRole: "SERVER",
    displayName: "自動安裝測試主機",
    platform: "macos",
    appVersion: "1.0.0-test",
  }));
  assert.equal(serverLeaseResponse.status, 200);
  const serverLeaseBody = await serverLeaseResponse.json();
  assert.equal(verifyOfflineLease(serverLeaseBody.lease), true);

  const registrationResponse = await registerServer(request("/api/license/register-server", {
    activationKey: activation.activationKey,
    deviceId: serverDeviceId,
    serverUrl: "https://192.168.50.20:3443",
    caCertificateB64: Buffer.from(caCertificate).toString("base64"),
  }));
  assert.equal(registrationResponse.status, 200);
  const registrationBody = await registrationResponse.json();
  assert.equal(registrationBody.companyCode, activation.companyCode);

  const localTenant = await prisma.tenant.create({ data: { name: "正在同步中央公司資料", businessMode: "ERP" } });
  localTenantId = localTenant.id;
  await seedTenantDefaults(localTenant.id);
  process.env.CENTRAL_LICENSE_URL = "https://central.example.invalid";
  process.env.LOCAL_ACTIVATION_KEY = activation.activationKey;
  process.env.LOCAL_DEVICE_ID = serverDeviceId;
  process.env.LOCAL_DEVICE_NAME = "自動安裝測試主機";
  globalThis.fetch = (async () => new Response(JSON.stringify(serverLeaseBody), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;
  await refreshLocalLicenseLease(localTenant.id);
  const syncedLocal = await prisma.tenant.findUniqueOrThrow({ where: { id: localTenant.id } });
  const syncedCompany = await prisma.companySetting.findFirstOrThrow({ where: { tenantId: localTenant.id } });
  assert.equal(syncedLocal.name, tenant.name);
  assert.equal(syncedLocal.businessMode, "POS_RESTAURANT");
  assert.equal(syncedCompany.name, tenant.name);
  assert.equal(await prisma.restaurantTable.count({ where: { tenantId: localTenant.id, isActive: true } }), 12);
  globalThis.fetch = originalFetch;

  const invalidResponse = await discover(request("/api/license/discover", {
    companyCode: activation.companyCode,
    activationKey: `${activation.activationKey}-wrong`,
  }));
  assert.equal(invalidResponse.status, 401);

  const discoverResponse = await discover(request("/api/license/discover", {
    companyCode: activation.companyCode.toLowerCase(),
    activationKey: activation.activationKey,
  }));
  assert.equal(discoverResponse.status, 200);
  const discoveryBody = await discoverResponse.json();
  assert.equal(verifyOfflineLease(discoveryBody.discovery), true);
  assert.equal(discoveryBody.discovery.payload.type, "ERIN_ERP_COMPANY_DISCOVERY_V1");
  assert.equal(discoveryBody.discovery.payload.companyCode, activation.companyCode);
  assert.equal(discoveryBody.discovery.payload.serverUrl, "https://192.168.50.20:3443");
  assert.match(discoveryBody.discovery.payload.caCertificate, /BEGIN CERTIFICATE/);
  assert.equal(await prisma.licenseDevice.count({ where: { tenantId, deviceRole: "SERVER", revokedAt: null } }), 1);

  for (let index = 0; index < 2; index += 1) {
    const device = workstation();
    const response = await lease(request("/api/license/lease", {
      activationKey: activation.activationKey,
      ...device,
      deviceRole: "WORKSTATION",
      displayName: `測試工作站 ${index + 1}`,
      platform: "macos",
      appVersion: "1.0.0-test",
    }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(verifyOfflineLease(result.lease), true);
  }

  const overLimit = workstation();
  const overLimitResponse = await lease(request("/api/license/lease", {
    activationKey: activation.activationKey,
    ...overLimit,
    deviceRole: "WORKSTATION",
    displayName: "超額工作站",
    platform: "windows",
    appVersion: "1.0.0-test",
  }));
  assert.equal(overLimitResponse.status, 409);
  assert.equal(await prisma.licenseDevice.count({ where: { tenantId, deviceRole: "WORKSTATION", revokedAt: null } }), 2);

  console.log("Company discovery, automatic host registration, signed edition sync, and workstation seat limits: PASS");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalLocalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (localTenantId) await deleteLocalFixture(localTenantId);
    if (tenantId) {
      await prisma.licensePayment.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
