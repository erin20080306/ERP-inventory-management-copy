import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { POST as storefrontOrders } from "../src/app/api/license/storefront-orders/route";
import { shipSalesOrder } from "../src/lib/documents";
import {
  fingerprintDeviceId,
  hashActivationKey,
  hashDeviceId,
  signOfflineLease,
} from "../src/lib/license";
import { prisma } from "../src/lib/prisma";
import { seedTenantDefaults } from "../src/lib/seed-tenant";
import { syncCentralStorefrontOrders } from "../src/lib/storefront-order-sync";
import { assertTestDatabase } from "./assert-test-database";

assertTestDatabase(/^erp_storefront_host_test_[a-z0-9_]+$/, "erp_storefront_host_test_*");
const suffix = randomBytes(6).toString("hex");
const activationKey = `ERP-${randomBytes(24).toString("base64url")}`;
const deviceId = `host-${randomBytes(18).toString("base64url")}`;
const keys = generateKeyPairSync("ed25519");
process.env.LICENSE_KEY_SECRET ||= randomBytes(32).toString("hex");
process.env.LICENSE_DEVICE_SECRET ||= randomBytes(32).toString("hex");
process.env.LICENSE_ED25519_PRIVATE_KEY_B64 = keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
process.env.LICENSE_ED25519_PUBLIC_KEY_B64 = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");

const originalEnv = {
  LOCAL_LICENSE_MODE: process.env.LOCAL_LICENSE_MODE,
  CENTRAL_LICENSE_URL: process.env.CENTRAL_LICENSE_URL,
  LOCAL_ACTIVATION_KEY: process.env.LOCAL_ACTIVATION_KEY,
  LOCAL_DEVICE_ID: process.env.LOCAL_DEVICE_ID,
};
const originalFetch = globalThis.fetch;
let centralTenantId = "";
let localTenantId = "";

async function cleanupTenant(tenantId: string) {
  if (!tenantId) return;
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { tenantId } });
    await tx.journalEntry.deleteMany({ where: { tenantId } });
    await tx.accountsReceivable.deleteMany({ where: { tenantId } });
    await tx.salesShipment.deleteMany({ where: { tenantId } });
    await tx.storefrontPayment.deleteMany({ where: { tenantId } });
    await tx.salesOrder.deleteMany({ where: { tenantId } });
    await tx.purchaseReceipt.deleteMany({ where: { tenantId } });
    await tx.purchaseOrder.deleteMany({ where: { tenantId } });
    await tx.inventoryTransaction.deleteMany({ where: { tenantId } });
    await tx.inventoryStock.deleteMany({ where: { tenantId } });
    await tx.posCouponRedemption.deleteMany({ where: { tenantId } });
    await tx.posPromotion.deleteMany({ where: { tenantId } });
    await tx.posCoupon.deleteMany({ where: { tenantId } });
    await tx.posShift.deleteMany({ where: { tenantId } });
    await tx.posRegister.deleteMany({ where: { tenantId } });
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
    await tx.licenseDevice.deleteMany({ where: { tenantId } });
    await tx.licenseEvent.deleteMany({ where: { tenantId } });
    await tx.licensePayment.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
}

async function main() {
  try {
    const now = new Date();
    const central = await prisma.tenant.create({
      data: {
        name: `中央商城租戶-${suffix}`,
        companyCode: `ERIN-${suffix.toUpperCase()}`,
        businessMode: "ECOMMERCE",
        licensePlan: "TEAM_2",
        licenseBilling: "ONCE",
        licenseStatus: "ACTIVE",
        licenseSeatLimit: 2,
        licenseActivatedAt: now,
        licenseKeyHash: hashActivationKey(activationKey),
        licenseVersion: 1,
      },
    });
    centralTenantId = central.id;
    await prisma.licenseDevice.create({
      data: {
        tenantId: central.id,
        deviceHash: hashDeviceId(deviceId),
        deviceRole: "SERVER",
        displayName: "商城同步測試 Host",
      },
    });
    const centralWarehouse = await prisma.warehouse.create({
      data: { tenantId: central.id, code: "WH01", name: "中央主倉庫" },
    });
    const centralProduct = await prisma.product.create({
      data: {
        tenantId: central.id,
        catalogMode: "ECOMMERCE",
        sku: `SYNC-${suffix}`,
        name: "中央商城同步商品",
        costPrice: 300,
        salePrice: 500,
        isPublished: true,
      },
    });
    const centralCustomer = await prisma.customer.create({
      data: {
        tenantId: central.id,
        code: `WEB-${suffix}`,
        companyName: "商城消費者",
        contactName: "商城消費者",
        phone: "0912345678",
        email: `buyer-${suffix}@example.test`,
        address: "台北市測試路 1 號",
      },
    });
    const centralOrder = await prisma.salesOrder.create({
      data: {
        tenantId: central.id,
        number: `EC-${suffix}`,
        customerId: centralCustomer.id,
        warehouseId: centralWarehouse.id,
        status: "SUBMITTED",
        subtotal: 1000,
        total: 1000,
        isTaxable: false,
        remark: `[WEB] request=${randomUUID()}; 宅配到府`,
        updatedBy: "WEB_CHECKOUT",
        items: {
          create: {
            productId: centralProduct.id,
            quantity: 2,
            unitPrice: 500,
            subtotal: 1000,
          },
        },
        storefrontPayment: {
          create: {
            tenantId: central.id,
            method: "TRANSFER",
            status: "AWAITING_TRANSFER",
            amount: 1000,
          },
        },
      },
    });

    const local = await prisma.tenant.create({
      data: {
        name: "安裝版 Host 租戶",
        companyCode: `ERIN-L${suffix.toUpperCase().slice(0, 11)}`,
        businessMode: "ECOMMERCE",
      },
    });
    localTenantId = local.id;
    await seedTenantDefaults(local.id);
    const localWarehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: local.id, code: "WH01" },
    });
    const localProduct = await prisma.product.create({
      data: {
        tenantId: local.id,
        catalogMode: "ECOMMERCE",
        sku: centralProduct.sku,
        name: centralProduct.name,
        costPrice: centralProduct.costPrice,
        salePrice: centralProduct.salePrice,
      },
    });
    await prisma.inventoryStock.create({
      data: {
        tenantId: local.id,
        productId: localProduct.id,
        warehouseId: localWarehouse.id,
        quantity: 10,
      },
    });
    const leaseIssuedAt = new Date();
    const leaseExpiresAt = new Date(leaseIssuedAt.getTime() + 24 * 60 * 60_000);
    const localLease = signOfflineLease({
      tenantId: central.id,
      companyCode: central.companyCode,
      deviceFingerprint: fingerprintDeviceId(deviceId),
      deviceRole: "SERVER",
      licenseVersion: 1,
      issuedAt: leaseIssuedAt.toISOString(),
      expiresAt: leaseExpiresAt.toISOString(),
    });
    await prisma.offlineLicenseLease.create({
      data: {
        tenantId: local.id,
        remoteTenantId: central.id,
        payload: localLease.payload as Prisma.InputJsonValue,
        signature: localLease.signature,
        algorithm: localLease.algorithm,
        issuedAt: leaseIssuedAt,
        expiresAt: leaseExpiresAt,
      },
    });

    process.env.LOCAL_LICENSE_MODE = "true";
    process.env.CENTRAL_LICENSE_URL = "https://central-sync.example.invalid";
    process.env.LOCAL_ACTIVATION_KEY = activationKey;
    process.env.LOCAL_DEVICE_ID = deviceId;
    globalThis.fetch = (async (input, init) => {
      const request = new NextRequest(String(input), {
        method: init?.method || "GET",
        headers: init?.headers,
        body: init?.body,
      });
      return storefrontOrders(request);
    }) as typeof fetch;

    const wrongDevice = await storefrontOrders(new NextRequest("http://localhost/api/license/storefront-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": `wrong-${suffix}` },
      body: JSON.stringify({ activationKey, deviceId: `wrong-${deviceId}`, cursor: null }),
    }));
    assert.equal(wrongDevice.status, 403);

    const orderCountBeforeSync = await prisma.salesOrder.count({ where: { tenantId: local.id } });
    const firstSync = await syncCentralStorefrontOrders(local.id);
    assert.equal(firstSync.imported, 1);
    const imported = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: local.id, remark: { contains: `[CENTRAL-WEB:${centralOrder.id}]` } },
      include: { customer: true, items: true, storefrontPayment: true },
    });
    assert.equal(imported.number, centralOrder.number);
    assert.equal(imported.status, "SUBMITTED");
    assert.equal(imported.customer.email, centralCustomer.email);
    assert.equal(imported.items.length, 1);
    assert.equal(imported.items[0].productId, localProduct.id);
    assert.equal(Number(imported.items[0].quantity), 2);
    assert.equal(imported.storefrontPayment?.status, "AWAITING_TRANSFER");

    const secondSync = await syncCentralStorefrontOrders(local.id);
    assert.equal(secondSync.imported, 0);
    assert.equal(await prisma.salesOrder.count({ where: { tenantId: local.id } }), orderCountBeforeSync + 1);

    await prisma.salesOrder.update({ where: { id: imported.id }, data: { status: "APPROVED" } });
    await shipSalesOrder(imported.id, localWarehouse.id, local.id);
    assert.equal(Number((await prisma.inventoryStock.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: localProduct.id, warehouseId: localWarehouse.id } },
    })).quantity), 8);
    assert.equal(await prisma.inventoryTransaction.count({
      where: { tenantId: local.id, type: "SALES_OUT", refType: "SALES_SHIPMENT" },
    }), 1);
    assert.equal(await prisma.accountsReceivable.count({
      where: { tenantId: local.id, salesOrderId: imported.id },
    }), 1);
    assert.equal(await prisma.journalEntry.count({ where: { tenantId: local.id, status: "POSTED" } }), 1);

    console.log("Vercel storefront order -> installed Host fulfillment, inventory and accounting: PASS");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await prisma.systemSetting.deleteMany({ where: { key: { contains: "storefront-order-sync:" } } });
    await cleanupTenant(localTenantId);
    await cleanupTenant(centralTenantId);
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
