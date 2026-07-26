import { z } from "zod";
import { fingerprintDeviceId, verifyOfflineLease, type SignedOfflineLease } from "./license";
import { nextNumberFastInTransaction } from "./number-sequence";
import { prisma } from "./prisma";

const CursorSchema = z.object({
  updatedAt: z.string().datetime(),
  id: z.string().min(1).max(100),
});

const CentralMemberSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).nullable(),
  phone: z.string().max(100).nullable(),
  email: z.string().email().max(200).nullable(),
  address: z.string().max(500).nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const PayloadSchema = z.object({
  type: z.literal("ERIN_ERP_STOREFRONT_MEMBERS_V1"),
  tenantId: z.string().min(1).max(100),
  companyCode: z.string().min(8).max(40),
  deviceFingerprint: z.string().min(20).max(100),
  licenseVersion: z.number().int().nonnegative(),
  members: z.array(CentralMemberSchema).max(100),
  nextCursor: CursorSchema.nullable(),
  hasMore: z.boolean(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type StorefrontMemberSyncPayload = z.infer<typeof PayloadSchema>;
export type StorefrontMemberSyncResult = {
  created: number;
  updated: number;
  disabled: number;
  pages: number;
};

const syncTasks = new Map<string, Promise<StorefrontMemberSyncResult>>();

function checkpointKey(tenantId: string) {
  return `storefront-member-sync:${tenantId}`;
}

function sourceMarker(sourceId: string) {
  return `[CENTRAL-MEMBER:${sourceId}]`;
}

function synchronizedRemark(remark: string | null, sourceId: string, active: boolean) {
  const marker = sourceMarker(sourceId);
  if (!active) return `中央商城會員已停用並匿名化 ${marker}`;
  if (remark?.includes(marker)) return remark;
  return [remark, "由中央商城會員同步", marker].filter(Boolean).join("; ");
}

async function readCheckpoint(tenantId: string) {
  const row = await prisma.systemSetting.findUnique({ where: { key: checkpointKey(tenantId) } });
  if (!row) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseSignedPayload(lease: SignedOfflineLease, expectedTenantId: string, deviceId: string) {
  if (!verifyOfflineLease(lease)) throw new Error("中央商城會員簽章無效");
  const parsed = PayloadSchema.safeParse(lease.payload);
  if (!parsed.success) throw new Error("中央商城會員格式無效");
  const payload = parsed.data;
  if (payload.tenantId !== expectedTenantId) throw new Error("中央商城會員不屬於此租戶");
  if (payload.deviceFingerprint !== fingerprintDeviceId(deviceId)) throw new Error("中央商城會員不屬於此公司主機");
  const now = Date.now();
  const issuedAt = new Date(payload.issuedAt).getTime();
  const expiresAt = new Date(payload.expiresAt).getTime();
  if (now < issuedAt - 5 * 60_000 || now >= expiresAt) throw new Error("中央商城會員同步憑證已過期");
  return payload;
}

async function localSyncConfig(tenantId: string) {
  if (process.env.LOCAL_LICENSE_MODE !== "true") return null;
  const activationKey = process.env.LOCAL_ACTIVATION_KEY?.trim();
  const deviceId = process.env.LOCAL_DEVICE_ID?.trim();
  const baseUrl = process.env.CENTRAL_LICENSE_URL?.replace(/\/$/, "");
  if (!activationKey || !deviceId || !baseUrl) throw new Error("公司 Host 缺少中央商城會員同步設定");

  const [tenant, localLease] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessMode: true } }),
    prisma.offlineLicenseLease.findUnique({ where: { tenantId }, select: { remoteTenantId: true } }),
  ]);
  if (tenant?.businessMode !== "ECOMMERCE") return null;
  if (!localLease?.remoteTenantId) throw new Error("公司 Host 尚未取得中央租戶識別");
  return { activationKey, deviceId, baseUrl, remoteTenantId: localLease.remoteTenantId };
}

export async function importCentralStorefrontMembers(
  tenantId: string,
  payload: StorefrontMemberSyncPayload,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`storefront-member-sync:${tenantId}`}))`;
    let created = 0;
    let updated = 0;
    let disabled = 0;

    for (const source of payload.members) {
      const marker = sourceMarker(source.id);
      const email = source.email?.trim().toLowerCase() ?? null;
      if (source.isActive && !email) throw new Error(`中央商城會員 ${source.id} 缺少 Email`);

      let customer = await tx.customer.findFirst({
        where: { tenantId, remark: { contains: marker } },
        select: { id: true, isActive: true, remark: true },
      });
      if (!customer && email) {
        customer = await tx.customer.findFirst({
          where: { tenantId, email: { equals: email, mode: "insensitive" } },
          orderBy: { createdAt: "asc" },
          select: { id: true, isActive: true, remark: true },
        });
      }

      if (!customer) {
        if (!source.isActive) continue;
        await tx.customer.create({
          data: {
            tenantId,
            code: await nextNumberFastInTransaction(tx, "WEB-C", tenantId),
            companyName: source.name,
            contactName: source.contactName || source.name,
            phone: source.phone,
            email,
            address: source.address,
            isActive: true,
            remark: synchronizedRemark(null, source.id, true),
            updatedBy: "CENTRAL_STOREFRONT_MEMBER_SYNC",
          },
        });
        created += 1;
        continue;
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: source.isActive
          ? {
              companyName: source.name,
              contactName: source.contactName || source.name,
              phone: source.phone,
              email,
              address: source.address,
              isActive: true,
              remark: synchronizedRemark(customer.remark, source.id, true),
              updatedBy: "CENTRAL_STOREFRONT_MEMBER_SYNC",
            }
          : {
              companyName: "已刪除會員",
              contactName: "已刪除會員",
              phone: null,
              email: null,
              address: null,
              isActive: false,
              remark: synchronizedRemark(customer.remark, source.id, false),
              updatedBy: "CENTRAL_STOREFRONT_MEMBER_SYNC",
            },
      });
      updated += 1;
      if (!source.isActive && customer.isActive) disabled += 1;
    }

    if (payload.nextCursor) {
      await tx.systemSetting.upsert({
        where: { key: checkpointKey(tenantId) },
        update: { value: JSON.stringify(payload.nextCursor) },
        create: { key: checkpointKey(tenantId), value: JSON.stringify(payload.nextCursor) },
      });
    }
    return { created, updated, disabled };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}

async function runSync(tenantId: string): Promise<StorefrontMemberSyncResult> {
  const config = await localSyncConfig(tenantId);
  if (!config) return { created: 0, updated: 0, disabled: 0, pages: 0 };

  let cursor = await readCheckpoint(tenantId);
  let created = 0;
  let updated = 0;
  let disabled = 0;
  let pages = 0;
  for (; pages < 20; pages += 1) {
    const response = await fetch(`${config.baseUrl}/api/license/storefront-members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activationKey: config.activationKey, deviceId: config.deviceId, cursor }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "中央商城會員同步失敗");
    const signed = result?.members as SignedOfflineLease | undefined;
    if (!signed) throw new Error("中央商城會員同步回覆不完整");
    const payload = parseSignedPayload(signed, config.remoteTenantId, config.deviceId);
    const imported = await importCentralStorefrontMembers(tenantId, payload);
    created += imported.created;
    updated += imported.updated;
    disabled += imported.disabled;
    cursor = payload.nextCursor;
    if (!payload.hasMore) return { created, updated, disabled, pages: pages + 1 };
    if (!cursor) throw new Error("中央商城會員分頁游標遺失");
  }
  throw new Error("中央商城會員過多，請重新整理客戶管理繼續同步");
}

export async function syncCentralStorefrontMembers(tenantId: string) {
  const existing = syncTasks.get(tenantId);
  if (existing) return existing;
  const task = runSync(tenantId).finally(() => syncTasks.delete(tenantId));
  syncTasks.set(tenantId, task);
  return task;
}
