import { createHash, createHmac, createPrivateKey, createPublicKey, randomBytes, sign as cryptoSign, timingSafeEqual, verify as cryptoVerify } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { BillingCycle, getPlan, getPlanPrice, PlanCode } from "./plans";
import { normalizeBusinessMode } from "./product-editions";
import { seedTenantDefaults } from "./seed-tenant";

export const TRIAL_DAYS = 3;
export const OFFLINE_LEASE_HOURS = 24;
export const ONLINE_REFRESH_MINUTES = 15;

export type LicenseAccessStatus = "paid" | "trial" | "expired" | "locked";

export type LicenseAccess = {
  status: LicenseAccessStatus;
  allowed: boolean;
  serverTime: string;
  remainMs?: number;
  subscriptionRemainMs?: number;
  trialExpiresAt?: string;
  activatedAt?: string;
  expiresAt?: string | null;
  paymentType?: BillingCycle | "LEGACY";
  planCode?: string | null;
  seatLimit: number;
  licenseVersion: number;
  reason?: string;
};

export type SignedOfflineLease = {
  payload: Record<string, unknown>;
  signature: string;
  algorithm: "ed25519" | "hmac-sha256";
};

const licenseAccessCache = new Map<string, { access: LicenseAccess; tenantId: string | null; expiresAt: number }>();

export function invalidateLicenseAccessCache(tenantId: string) {
  for (const [userId, entry] of licenseAccessCache) {
    if (entry.tenantId === tenantId) licenseAccessCache.delete(userId);
  }
}

type TenantLicenseInput = {
  now?: Date;
  isSuperAdmin?: boolean;
  tenantCreatedAt?: Date | string | null;
  licensePlan?: string | null;
  licenseBilling?: string | null;
  licenseStatus?: string | null;
  licenseSeatLimit?: number | null;
  licenseActivatedAt?: Date | string | null;
  licenseExpiresAt?: Date | string | null;
  licenseKeyHash?: string | null;
  licenseVersion?: number | null;
  legacyIsPaid?: boolean;
  legacyPaymentType?: string | null;
  legacySubscriptionEnd?: Date | string | null;
};

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function computeLicenseAccess(input: TenantLicenseInput): LicenseAccess {
  const now = input.now ?? new Date();
  const serverTime = now.toISOString();
  const seatLimit = Math.max(1, input.licenseSeatLimit ?? 2);
  const licenseVersion = input.licenseVersion ?? 0;

  if (input.isSuperAdmin) {
    return { status: "paid", allowed: true, serverTime, paymentType: "ONCE", seatLimit, licenseVersion };
  }

  const activatedAt = asDate(input.licenseActivatedAt);
  const activatedAtIso = activatedAt?.toISOString();
  const licenseExpiresAt = asDate(input.licenseExpiresAt);
  const configured = Boolean(
    activatedAt ||
    input.licenseKeyHash ||
    (input.licenseStatus && input.licenseStatus !== "TRIAL")
  );

  if (configured) {
    if (input.licenseStatus === "REVOKED") {
      return { status: "locked", allowed: false, serverTime, planCode: input.licensePlan, activatedAt: activatedAtIso, seatLimit, licenseVersion, reason: "授權已由管理者撤銷" };
    }
    if (input.licenseStatus !== "ACTIVE") {
      return { status: "locked", allowed: false, serverTime, planCode: input.licensePlan, activatedAt: activatedAtIso, seatLimit, licenseVersion, reason: "授權尚未開通" };
    }

    const billing = input.licenseBilling as BillingCycle | null;
    if (billing === "ONCE") {
      return {
        status: "paid",
        allowed: true,
        serverTime,
        paymentType: "ONCE",
        planCode: input.licensePlan,
        activatedAt: activatedAtIso,
        expiresAt: null,
        seatLimit,
        licenseVersion,
      };
    }

    if (licenseExpiresAt && now.getTime() < licenseExpiresAt.getTime()) {
      return {
        status: "paid",
        allowed: true,
        serverTime,
        paymentType: billing ?? "LEGACY",
        planCode: input.licensePlan,
        activatedAt: activatedAtIso,
        expiresAt: licenseExpiresAt.toISOString(),
        subscriptionRemainMs: licenseExpiresAt.getTime() - now.getTime(),
        seatLimit,
        licenseVersion,
      };
    }

    return {
      status: "locked",
      allowed: false,
      serverTime,
      paymentType: billing ?? "LEGACY",
      planCode: input.licensePlan,
      activatedAt: activatedAtIso,
      expiresAt: licenseExpiresAt?.toISOString() ?? null,
      seatLimit,
      licenseVersion,
      reason: "租用方案已到期",
    };
  }

  // 舊資料相容：完成新授權開通後，不再使用個別 User 的付款欄位。
  if (input.legacyIsPaid) {
    const legacyEnd = asDate(input.legacySubscriptionEnd);
    if (input.legacyPaymentType === "MONTHLY" || input.legacyPaymentType === "ANNUAL") {
      if (legacyEnd && now.getTime() < legacyEnd.getTime()) {
        return {
          status: "paid",
          allowed: true,
          serverTime,
          paymentType: input.legacyPaymentType,
          subscriptionRemainMs: legacyEnd.getTime() - now.getTime(),
          expiresAt: legacyEnd.toISOString(),
          seatLimit,
          licenseVersion,
        };
      }
      return { status: "locked", allowed: false, serverTime, paymentType: input.legacyPaymentType, seatLimit, licenseVersion, reason: "舊版租用方案已到期" };
    }
    return { status: "paid", allowed: true, serverTime, paymentType: "ONCE", seatLimit, licenseVersion };
  }

  const tenantCreatedAt = asDate(input.tenantCreatedAt);
  if (!tenantCreatedAt) {
    return { status: "locked", allowed: false, serverTime, seatLimit, licenseVersion, reason: "找不到公司授權資料" };
  }
  const expiresAt = new Date(tenantCreatedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const remainMs = expiresAt.getTime() - now.getTime();
  if (remainMs <= 0) {
    return {
      status: "expired",
      allowed: false,
      serverTime,
      trialExpiresAt: expiresAt.toISOString(),
      seatLimit,
      licenseVersion,
      reason: "3 日試用期已結束",
    };
  }
  return {
    status: "trial",
    allowed: true,
    serverTime,
    remainMs,
    trialExpiresAt: expiresAt.toISOString(),
    seatLimit,
    licenseVersion,
  };
}

export async function getLicenseAccessForUser(userId: string): Promise<LicenseAccess> {
  const cached = licenseAccessCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.access;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      isPaid: true,
      paymentType: true,
      subscriptionEnd: true,
      tenant: {
        select: {
          id: true,
          createdAt: true,
          licensePlan: true,
          licenseBilling: true,
          licenseStatus: true,
          licenseSeatLimit: true,
          licenseActivatedAt: true,
          licenseExpiresAt: true,
          licenseKeyHash: true,
          licenseVersion: true,
          users: {
            where: { isPaid: true },
            take: 1,
            select: { isPaid: true, paymentType: true, subscriptionEnd: true },
          },
        },
      },
    },
  });

  if (!user) {
    const access = computeLicenseAccess({ tenantCreatedAt: null });
    licenseAccessCache.set(userId, { access, tenantId: null, expiresAt: Date.now() + 15_000 });
    return access;
  }
  // 平台管理者的獨立內部帳套永久免費；一般客戶管理員仍完整套用授權與席次。
  if (user.isSuperAdmin) {
    const access = computeLicenseAccess({ isSuperAdmin: true });
    licenseAccessCache.set(userId, { access, tenantId: user.tenant?.id ?? null, expiresAt: Date.now() + 30_000 });
    return access;
  }
  // 客戶端本機版必須持有有效主機授權。
  if (process.env.LOCAL_LICENSE_MODE === "true" && user.tenant?.id) {
    const access = await resolveLocalLicenseAccess(user.tenant.id);
    licenseAccessCache.set(userId, { access, tenantId: user.tenant.id, expiresAt: Date.now() + 15_000 });
    return access;
  }
  const legacy = user.tenant?.users[0] ?? user;
  const access = computeLicenseAccess({
    isSuperAdmin: user.isSuperAdmin,
    tenantCreatedAt: user.tenant?.createdAt,
    licensePlan: user.tenant?.licensePlan,
    licenseBilling: user.tenant?.licenseBilling,
    licenseStatus: user.tenant?.licenseStatus,
    licenseSeatLimit: user.tenant?.licenseSeatLimit,
    licenseActivatedAt: user.tenant?.licenseActivatedAt,
    licenseExpiresAt: user.tenant?.licenseExpiresAt,
    licenseKeyHash: user.tenant?.licenseKeyHash,
    licenseVersion: user.tenant?.licenseVersion,
    legacyIsPaid: legacy.isPaid,
    legacyPaymentType: legacy.paymentType,
    legacySubscriptionEnd: legacy.subscriptionEnd,
  });
  licenseAccessCache.set(userId, { access, tenantId: user.tenant?.id ?? null, expiresAt: Date.now() + 15_000 });
  return access;
}

function secret(name: "key" | "device" | "audit") {
  const specific = {
    key: process.env.LICENSE_KEY_SECRET,
    device: process.env.LICENSE_DEVICE_SECRET,
    audit: process.env.LICENSE_AUDIT_SECRET,
  }[name];
  const value = specific || process.env.NEXTAUTH_SECRET;
  if (!value || value === "please-change-me-to-a-long-random-string") {
    throw new Error(`缺少授權簽章密鑰：${name}`);
  }
  return value;
}

function hmac(value: string, key: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function createActivationKey() {
  return `ERP-${randomBytes(24).toString("base64url")}`;
}

export function createCompanyCode() {
  return `ERIN-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function normalizeCompanyCode(value: string) {
  return value.trim().toUpperCase();
}

export async function ensureTenantCompanyCode(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { companyCode: true } });
  if (!tenant) throw new Error("找不到租戶");
  if (tenant.companyCode) return tenant.companyCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const companyCode = createCompanyCode();
    try {
      const result = await prisma.tenant.updateMany({
        where: { id: tenantId, companyCode: null },
        data: { companyCode },
      });
      if (result.count) return companyCode;
      const current = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { companyCode: true } });
      if (current?.companyCode) return current.companyCode;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error("公司代碼產生失敗");
}

export function hashActivationKey(value: string) {
  return hmac(value.trim(), secret("key"));
}

export function hashDeviceId(value: string) {
  return hmac(value.trim(), secret("device"));
}

// 這個指紋會放入中央私鑰簽章的租約，讓本機能用公鑰確認租約確實屬於目前裝置。
// 中央資料庫仍只保存伺服器密鑰 HMAC 的 deviceHash，不保存原始裝置識別碼。
export function fingerprintDeviceId(value: string) {
  return createHash("sha256").update(value.trim()).digest("base64url");
}

export function workstationDeviceIdFromPublicKey(publicKeyB64: string) {
  const key = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "ed25519") throw new Error("工作站裝置金鑰必須是 Ed25519");
  const normalized = key.export({ format: "der", type: "spki" });
  return `ERP-WS-${createHash("sha256").update(normalized).digest("base64url")}`;
}

export function workstationProofMaterial(input: {
  deviceFingerprint: string;
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
}) {
  return [
    "ERIN-ERP-WORKSTATION-PROOF-V1",
    input.deviceFingerprint,
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
  ].join("\n");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

export async function appendLicenseEvent(input: {
  tenantId: string;
  action: string;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const createdAt = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`license:${input.tenantId}`}))`;
    return appendLicenseEventInTransaction(tx, input, createdAt);
  });
}

async function appendLicenseEventInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; action: string; actorUserId?: string | null; payload?: Record<string, unknown> },
  createdAt = new Date(),
) {
  const previous = await tx.licenseEvent.findFirst({
    where: { tenantId: input.tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { eventHash: true },
  });
  const previousHash = previous?.eventHash ?? "GENESIS";
  const material = stableJson({
    tenantId: input.tenantId,
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    payload: input.payload ?? {},
    previousHash,
    createdAt: createdAt.toISOString(),
  });
  const eventHash = hmac(material, secret("audit"));
  return tx.licenseEvent.create({
    data: {
      tenantId: input.tenantId,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      previousHash,
      eventHash,
      createdAt,
    },
  });
}

export async function verifyLicenseEventChain(tenantId: string) {
  const events = await prisma.licenseEvent.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  let previousHash = "GENESIS";
  for (const event of events) {
    const material = stableJson({
      tenantId: event.tenantId,
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      payload: event.payload ?? {},
      previousHash,
      createdAt: event.createdAt.toISOString(),
    });
    const expected = hmac(material, secret("audit"));
    const actualBuffer = Buffer.from(event.eventHash, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (
      event.previousHash !== previousHash ||
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return { valid: false, brokenEventId: event.id, checked: events.length };
    }
    previousHash = event.eventHash;
  }
  return { valid: true, brokenEventId: null, checked: events.length, headHash: previousHash };
}

export function defaultExpiry(cycle: BillingCycle, from = new Date()) {
  if (cycle === "ONCE") return null;
  const day = from.getUTCDate();
  const result = new Date(from);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + (cycle === "MONTHLY" ? 1 : 12));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function calculateRenewalExpiry(input: {
  billing: BillingCycle;
  now: Date;
  currentExpiresAt?: Date | null;
  requestedExpiresAt?: Date | null;
}) {
  if (input.billing === "ONCE") return null;
  if (input.requestedExpiresAt) {
    if (input.requestedExpiresAt.getTime() <= input.now.getTime()) throw new Error("授權到期日必須晚於付款確認時間");
    return input.requestedExpiresAt;
  }
  const base = input.currentExpiresAt && input.currentExpiresAt.getTime() > input.now.getTime()
    ? input.currentExpiresAt
    : input.now;
  return defaultExpiry(input.billing, base);
}

export function clampOfflineLeaseExpiry(issuedAt: Date, subscriptionExpiresAt?: Date | string | null) {
  const offlineLimit = new Date(issuedAt.getTime() + OFFLINE_LEASE_HOURS * 60 * 60_000);
  const subscriptionEnd = asDate(subscriptionExpiresAt);
  return subscriptionEnd && subscriptionEnd.getTime() < offlineLimit.getTime() ? subscriptionEnd : offlineLimit;
}

export type LicensePaymentConfirmation = {
  paidAmount: number;
  paidAt: Date;
  paymentMethod: "BANK_TRANSFER" | "CASH" | "OTHER";
  paymentReference: string;
  notes?: string | null;
};

export async function activateTenantLicense(input: {
  tenantId: string;
  planCode: PlanCode;
  billing: BillingCycle;
  actorUserId: string;
  expiresAt?: Date | null;
  rotateKey?: boolean;
  payment: LicensePaymentConfirmation;
}) {
  const plan = getPlan(input.planCode);
  if (!plan) throw new Error("無效方案");
  const current = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      isInternal: true,
      licenseKeyHash: true,
      licenseStatus: true,
      licenseBilling: true,
      licenseActivatedAt: true,
      licenseExpiresAt: true,
    },
  });
  if (!current) throw new Error("找不到租戶");
  if (current.isInternal) throw new Error("平台管理者內部帳套不建立客戶付款授權");
  if (!Number.isFinite(input.payment.paidAmount) || input.payment.paidAmount <= 0) throw new Error("實收金額必須大於 0");
  if (input.payment.paidAt.getTime() > Date.now() + 5 * 60_000) throw new Error("付款時間不可晚於目前時間");
  const paymentReference = input.payment.paymentReference.trim().toUpperCase();
  if (paymentReference.length < 3 || paymentReference.length > 100) throw new Error("付款參考編號格式錯誤");

  const shouldGenerateKey = !current.licenseKeyHash || input.rotateKey;
  const activationKey = shouldGenerateKey ? createActivationKey() : null;
  const now = new Date();
  const expiresAt = calculateRenewalExpiry({
    billing: input.billing,
    now,
    currentExpiresAt: current.licenseStatus === "ACTIVE" && current.licenseBilling !== "ONCE" ? current.licenseExpiresAt : null,
    requestedExpiresAt: input.expiresAt,
  });
  const companyCode = await ensureTenantCompanyCode(input.tenantId);
  const paymentId = `PAY-${randomBytes(12).toString("hex").toUpperCase()}`;
  const quotedAmount = getPlanPrice(plan, input.billing);
  const paymentCreatedAt = new Date();
  const paymentSnapshot = {
    id: paymentId,
    tenantId: input.tenantId,
    planCode: plan.code,
    billing: input.billing,
    quotedAmount: quotedAmount.toFixed(2),
    paidAmount: input.payment.paidAmount.toFixed(2),
    paymentMethod: input.payment.paymentMethod,
    paymentReference,
    paidAt: input.payment.paidAt.toISOString(),
    confirmedByUserId: input.actorUserId,
    notes: input.payment.notes?.trim() || null,
    createdAt: paymentCreatedAt.toISOString(),
  };
  const paymentRecordHash = hmac(stableJson(paymentSnapshot), secret("audit"));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`activation:${input.tenantId}`}))`;
    const duplicate = await tx.licensePayment.findUnique({
      where: { tenantId_paymentReference: { tenantId: input.tenantId, paymentReference } },
      select: { id: true },
    });
    if (duplicate) throw new Error("此付款參考編號已用於開通，請勿重複入帳");
    await tx.licensePayment.create({ data: { ...paymentSnapshot, quotedAmount, paidAmount: input.payment.paidAmount, paidAt: input.payment.paidAt, createdAt: paymentCreatedAt, recordHash: paymentRecordHash } });
    await tx.tenant.update({
      where: { id: input.tenantId },
      data: {
        licensePlan: plan.code,
        licenseBilling: input.billing,
        licenseStatus: "ACTIVE",
        licenseSeatLimit: plan.seats,
        licenseActivatedAt: current.licenseActivatedAt ?? now,
        licenseExpiresAt: expiresAt,
        licenseMaintenanceEnd: input.billing === "ONCE" ? defaultExpiry("ANNUAL", now) : expiresAt,
        licenseKeyHash: activationKey ? hashActivationKey(activationKey) : undefined,
        licenseKeyPrefix: activationKey ? activationKey.slice(0, 12) : undefined,
        licenseVersion: { increment: 1 },
        licenseUpdatedAt: now,
        companyCode,
      },
    });
    await tx.user.updateMany({
      where: { tenantId: input.tenantId },
      data: {
        isPaid: true,
        paymentType: input.billing,
        subscriptionEnd: expiresAt,
        isActive: true,
      },
    });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`license:${input.tenantId}`}))`;
    await appendLicenseEventInTransaction(tx, {
      tenantId: input.tenantId,
      action: activationKey ? "LICENSE_ACTIVATED" : "LICENSE_RENEWED",
      actorUserId: input.actorUserId,
      payload: {
        planCode: plan.code,
        billing: input.billing,
        seats: plan.seats,
        expiresAt: expiresAt?.toISOString() ?? null,
        keyRotated: Boolean(activationKey),
        paymentId,
        quotedAmount,
        paidAmount: input.payment.paidAmount,
        paymentMethod: input.payment.paymentMethod,
        paidAt: input.payment.paidAt.toISOString(),
        paymentRecordHash,
      },
    }, now);
  });

  invalidateLicenseAccessCache(input.tenantId);

  return { activationKey, expiresAt, plan, companyCode, paymentId };
}

export async function verifyLicensePaymentRecords(tenantId: string) {
  const rows = await prisma.licensePayment.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  for (const row of rows) {
    const snapshot = {
      id: row.id,
      tenantId: row.tenantId,
      planCode: row.planCode,
      billing: row.billing,
      quotedAmount: row.quotedAmount.toFixed(2),
      paidAmount: row.paidAmount.toFixed(2),
      paymentMethod: row.paymentMethod,
      paymentReference: row.paymentReference,
      paidAt: row.paidAt.toISOString(),
      confirmedByUserId: row.confirmedByUserId,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
    const expected = hmac(stableJson(snapshot), secret("audit"));
    const actualBuffer = Buffer.from(row.recordHash, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      return { valid: false, checked: rows.length, brokenPaymentId: row.id };
    }
  }
  return { valid: true, checked: rows.length };
}

export async function revokeTenantLicense(tenantId: string, actorUserId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: tenantId },
      data: { licenseStatus: "REVOKED", licenseVersion: { increment: 1 }, licenseUpdatedAt: now },
    }),
    prisma.user.updateMany({
      where: { tenantId },
      data: { isPaid: false, paymentType: null, subscriptionEnd: null },
    }),
    prisma.licenseDevice.updateMany({ where: { tenantId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await appendLicenseEvent({ tenantId, action: "LICENSE_REVOKED", actorUserId, payload: { revokedAt: now.toISOString() } });
  invalidateLicenseAccessCache(tenantId);
}

export function signOfflineLease(payload: Record<string, unknown>) {
  const serialized = stableJson(payload);
  const privateKey = process.env.LICENSE_ED25519_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const privateKeyB64 = process.env.LICENSE_ED25519_PRIVATE_KEY_B64;
  if (!privateKey && !privateKeyB64) throw new Error("中央授權伺服器缺少 Ed25519 私鑰，拒絕簽發離線租約");
  const key = privateKey
    ? createPrivateKey(privateKey)
    : createPrivateKey({ key: Buffer.from(privateKeyB64!, "base64"), format: "der", type: "pkcs8" });
  const signature = cryptoSign(null, Buffer.from(serialized), key).toString("base64url");
  return { payload, signature, algorithm: "ed25519" as const };
}

export function verifyOfflineLease(lease: SignedOfflineLease) {
  if (lease.algorithm !== "ed25519") return false;
  const publicKey = process.env.LICENSE_ED25519_PUBLIC_KEY?.replace(/\\n/g, "\n");
  const publicKeyB64 = process.env.LICENSE_ED25519_PUBLIC_KEY_B64;
  if (!publicKey && !publicKeyB64) return false;
  try {
    const key = publicKey
      ? createPublicKey(publicKey)
      : createPublicKey({ key: Buffer.from(publicKeyB64!, "base64"), format: "der", type: "spki" });
    return cryptoVerify(null, Buffer.from(stableJson(lease.payload)), key, Buffer.from(lease.signature, "base64url"));
  } catch {
    return false;
  }
}

const refreshes = new Map<string, Promise<void>>();

class LicenseDeniedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "LicenseDeniedError";
  }
}

export async function refreshLocalLicenseLease(tenantId: string) {
  const existing = refreshes.get(tenantId);
  if (existing) return existing;
  const task = (async () => {
    const baseUrl = process.env.CENTRAL_LICENSE_URL?.replace(/\/$/, "");
    const activationKey = process.env.LOCAL_ACTIVATION_KEY;
    const deviceId = process.env.LOCAL_DEVICE_ID;
    if (!baseUrl || !activationKey || !deviceId) throw new Error("本機授權環境變數尚未設定");
    const response = await fetch(`${baseUrl}/api/license/lease`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activationKey, deviceId, deviceRole: "SERVER", displayName: process.env.LOCAL_DEVICE_NAME, platform: process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux", appVersion: process.env.npm_package_version || "1.0.0" }),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) {
      const message = result.error || "中央授權驗證失敗";
      if ([401, 402, 403, 409].includes(response.status)) {
        throw new LicenseDeniedError(message, response.status);
      }
      throw new Error(message);
    }
    const lease = result.lease as SignedOfflineLease;
    if (!lease || !verifyOfflineLease(lease)) throw new Error("中央授權簽章無效");
    if (String(lease.payload.deviceFingerprint || "") !== fingerprintDeviceId(deviceId)) {
      throw new Error("中央授權租約與目前裝置不符");
    }
    if (lease.payload.deviceRole && lease.payload.deviceRole !== "SERVER") {
      throw new Error("中央授權租約不是公司主機授權");
    }
    const issuedAt = new Date(String(lease.payload.issuedAt));
    const expiresAt = new Date(String(lease.payload.expiresAt));
    const remoteTenantId = String(lease.payload.tenantId || "");
    const tenantName = String(lease.payload.tenantName || "").trim();
    const businessMode = normalizeBusinessMode(String(lease.payload.businessMode || ""));
    if (!remoteTenantId || Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) throw new Error("中央授權內容不完整");
    if (!tenantName || tenantName.length > 200) throw new Error("中央授權公司名稱無效");
    const currentTenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessMode: true } });
    if (!currentTenant) throw new Error("找不到本機公司資料");
    await prisma.$transaction([
      prisma.offlineLicenseLease.upsert({
        where: { tenantId },
        update: { remoteTenantId, payload: lease.payload as Prisma.InputJsonValue, signature: lease.signature, algorithm: lease.algorithm, issuedAt, expiresAt, checkedAt: new Date(), lastObservedAt: new Date(), lastError: null },
        create: { tenantId, remoteTenantId, payload: lease.payload as Prisma.InputJsonValue, signature: lease.signature, algorithm: lease.algorithm, issuedAt, expiresAt, lastObservedAt: new Date() },
      }),
      prisma.tenant.update({ where: { id: tenantId }, data: { name: tenantName, businessMode } }),
      prisma.companySetting.updateMany({ where: { tenantId }, data: { name: tenantName } }),
    ]);
    if (normalizeBusinessMode(currentTenant.businessMode) !== businessMode) await seedTenantDefaults(tenantId);
  })().catch(async (error) => {
    await prisma.offlineLicenseLease.updateMany({ where: { tenantId }, data: { lastError: error instanceof Error ? error.message.slice(0, 500) : "中央授權驗證失敗" } });
    throw error;
  }).finally(() => refreshes.delete(tenantId));
  refreshes.set(tenantId, task);
  return task;
}

export async function resolveLocalLicenseAccess(tenantId: string): Promise<LicenseAccess> {
  let lease = await prisma.offlineLicenseLease.findUnique({ where: { tenantId } });
  const needsRefresh = !lease || Date.now() - lease.checkedAt.getTime() > ONLINE_REFRESH_MINUTES * 60_000;
  let deniedReason: string | null = null;
  if (needsRefresh) {
    try {
      await refreshLocalLicenseLease(tenantId);
      lease = await prisma.offlineLicenseLease.findUnique({ where: { tenantId } });
    } catch (error) {
      if (error instanceof LicenseDeniedError) deniedReason = error.message;
      // 短暫離線時沿用尚未過期且簽章有效的租約。
    }
  }
  const now = new Date();
  if (deniedReason) {
    return {
      status: "locked",
      allowed: false,
      serverTime: now.toISOString(),
      seatLimit: Number((lease?.payload as Record<string, unknown> | null)?.seatLimit || 1),
      licenseVersion: Number((lease?.payload as Record<string, unknown> | null)?.licenseVersion || 0),
      reason: deniedReason,
    };
  }
  if (!lease) return { status: "locked", allowed: false, serverTime: now.toISOString(), seatLimit: 1, licenseVersion: 0, reason: "尚未取得中央授權，請檢查啟用碼與網路" };
  const signed = { payload: lease.payload as Record<string, unknown>, signature: lease.signature, algorithm: lease.algorithm as SignedOfflineLease["algorithm"] };
  if (!verifyOfflineLease(signed)) return { status: "locked", allowed: false, serverTime: now.toISOString(), seatLimit: 1, licenseVersion: 0, reason: "本機授權簽章驗證失敗" };
  const signedIssuedAt = new Date(String(signed.payload.issuedAt || ""));
  const signedExpiresAt = new Date(String(signed.payload.expiresAt || ""));
  const signedTenantId = String(signed.payload.tenantId || "");
  if (
    !signedTenantId || signedTenantId !== lease.remoteTenantId ||
    Number.isNaN(signedIssuedAt.getTime()) || Number.isNaN(signedExpiresAt.getTime()) ||
    signedIssuedAt.getTime() !== lease.issuedAt.getTime() || signedExpiresAt.getTime() !== lease.expiresAt.getTime()
  ) {
    return { status: "locked", allowed: false, serverTime: now.toISOString(), seatLimit: Number(signed.payload.seatLimit || 1), licenseVersion: Number(signed.payload.licenseVersion || 0), reason: "本機授權日期或公司識別與中央簽章不一致" };
  }
  const localDeviceId = process.env.LOCAL_DEVICE_ID;
  if (!localDeviceId || String(signed.payload.deviceFingerprint || "") !== fingerprintDeviceId(localDeviceId)) {
    return { status: "locked", allowed: false, serverTime: now.toISOString(), seatLimit: Number(signed.payload.seatLimit || 1), licenseVersion: Number(signed.payload.licenseVersion || 0), reason: "本機授權不屬於此電腦，請連線中央授權伺服器重新綁定" };
  }
  if (now.getTime() < signedIssuedAt.getTime() - 5 * 60_000 || now.getTime() < lease.lastObservedAt.getTime() - 5 * 60_000) {
    return { status: "locked", allowed: false, serverTime: now.toISOString(), seatLimit: Number(signed.payload.seatLimit || 1), licenseVersion: Number(signed.payload.licenseVersion || 0), reason: "偵測到電腦時間回撥，請連線中央授權伺服器校時" };
  }
  if (now.getTime() >= signedExpiresAt.getTime()) return { status: "locked", allowed: false, serverTime: now.toISOString(), expiresAt: signedExpiresAt.toISOString(), seatLimit: Number(signed.payload.seatLimit || 1), licenseVersion: Number(signed.payload.licenseVersion || 0), reason: "離線授權租約已到期，請恢復網路連線" };
  if (now.getTime() - lease.lastObservedAt.getTime() > 60_000) await prisma.offlineLicenseLease.update({ where: { tenantId }, data: { lastObservedAt: now } });
  return { status: "paid", allowed: true, serverTime: now.toISOString(), paymentType: "LEGACY", planCode: String(signed.payload.planCode || ""), expiresAt: signedExpiresAt.toISOString(), subscriptionRemainMs: signedExpiresAt.getTime() - now.getTime(), seatLimit: Number(signed.payload.seatLimit || 1), licenseVersion: Number(signed.payload.licenseVersion || 0) };
}

type RequestHeaders = { get(name: string): string | null };
type WorkstationRequest = { method: string; path: string; headers: RequestHeaders };
const acceptedWorkstationProofs = new Map<string, number>();

function rejectWorkstation(reason: string) {
  return { allowed: false as const, reason };
}

/**
 * 驗證原生桌面代理程式的工作站證明：中央租約把 Ed25519 公鑰綁定到席次，
 * 每一個請求則必須由只存在於該電腦 OS 安全儲存區的私鑰簽章。
 */
export async function verifyLocalWorkstationRequest(tenantId: string, request: WorkstationRequest) {
  if (process.env.LOCAL_LICENSE_MODE !== "true") return { allowed: true as const };

  const encodedLease = request.headers.get("x-erin-workstation-lease");
  const timestamp = request.headers.get("x-erin-workstation-time");
  const nonce = request.headers.get("x-erin-workstation-nonce");
  const proof = request.headers.get("x-erin-workstation-proof");
  if (!encodedLease || !timestamp || !nonce || !proof) {
    return rejectWorkstation("本機版必須使用已授權的艾琳 ERP／POS 桌面客戶端");
  }
  if (!/^\d{13}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    return rejectWorkstation("工作站驗證資料格式錯誤");
  }

  const now = Date.now();
  if (Math.abs(now - Number(timestamp)) > 2 * 60_000) {
    return rejectWorkstation("工作站時間不同步，請校正電腦時間後重試");
  }

  let lease: SignedOfflineLease;
  try {
    lease = JSON.parse(Buffer.from(encodedLease, "base64url").toString("utf8"));
  } catch {
    return rejectWorkstation("工作站租約格式錯誤");
  }
  if (!lease || !verifyOfflineLease(lease)) return rejectWorkstation("工作站租約簽章無效");
  if (lease.payload.deviceRole !== "WORKSTATION") return rejectWorkstation("此授權不是工作站席次");

  const issuedAt = new Date(String(lease.payload.issuedAt || ""));
  const expiresAt = new Date(String(lease.payload.expiresAt || ""));
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return rejectWorkstation("工作站租約日期無效");
  }
  if (now < issuedAt.getTime() - 5 * 60_000 || now >= expiresAt.getTime()) {
    return rejectWorkstation("工作站離線租約已到期，請恢復網路連線");
  }

  const serverLease = await prisma.offlineLicenseLease.findUnique({ where: { tenantId } });
  const serverPayload = serverLease?.payload as Record<string, unknown> | undefined;
  if (!serverLease || String(lease.payload.tenantId || "") !== serverLease.remoteTenantId) {
    return rejectWorkstation("工作站與公司主機不屬於同一授權");
  }
  if (Number(lease.payload.licenseVersion || 0) !== Number(serverPayload?.licenseVersion || 0)) {
    return rejectWorkstation("工作站授權版本已更新，請重新連線中央伺服器");
  }

  const publicKeyB64 = String(lease.payload.devicePublicKey || "");
  const deviceFingerprint = String(lease.payload.deviceFingerprint || "");
  try {
    const derivedDeviceId = workstationDeviceIdFromPublicKey(publicKeyB64);
    if (fingerprintDeviceId(derivedDeviceId) !== deviceFingerprint) {
      return rejectWorkstation("工作站公鑰與中央裝置身分不一致");
    }
    const key = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    const material = workstationProofMaterial({
      deviceFingerprint,
      method: request.method,
      path: request.path,
      timestamp,
      nonce,
    });
    if (!cryptoVerify(null, Buffer.from(material), key, Buffer.from(proof, "base64url"))) {
      return rejectWorkstation("工作站請求簽章無效");
    }
  } catch {
    return rejectWorkstation("工作站公鑰或請求簽章無效");
  }

  for (const [key, expires] of acceptedWorkstationProofs) {
    if (expires <= now) acceptedWorkstationProofs.delete(key);
  }
  const replayKey = `${deviceFingerprint}:${nonce}`;
  if (acceptedWorkstationProofs.has(replayKey)) return rejectWorkstation("偵測到重複的工作站請求");
  acceptedWorkstationProofs.set(replayKey, now + 2 * 60_000);

  return {
    allowed: true as const,
    deviceId: String(lease.payload.deviceId || ""),
    expiresAt: expiresAt.toISOString(),
  };
}
