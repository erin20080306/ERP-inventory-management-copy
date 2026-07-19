import { prisma } from "./prisma";
import { seedTenantDefaultsBatched } from "./seed-tenant-batched";

const BASELINE_MARKER_ACTION = "tenant_baseline_v2_seeded";
const readyTenants = new Set<string>();
const pendingTenants = new Map<string, Promise<void>>();

/**
 * 只檢查初始化完成標記，不建立任何資料。
 * 可安全用於工作台路由守門，避免登入流程再次被初始化拖慢。
 */
export async function isTenantBaselineReady(tenantId: string | null | undefined) {
  if (!tenantId) return false;
  if (readyTenants.has(tenantId)) return true;

  const marker = await prisma.auditLog.findFirst({
    where: { tenantId, action: BASELINE_MARKER_ACTION },
    select: { id: true },
  });
  if (!marker) return false;

  readyTenants.add(tenantId);
  return true;
}

/**
 * 確保公司帳套具有完整基礎資料。
 *
 * 此函式只能由獨立初始化 API／維護腳本呼叫；註冊與 NextAuth 不再同步等待。
 * AuditLog 是一次性版本標記，初始化失敗時可安全重試，使用者日後自行刪除
 * 範例資料也不會被自動重建。
 */
export async function ensureTenantBaseline(tenantId: string | null | undefined) {
  if (!tenantId || await isTenantBaselineReady(tenantId)) return;

  const pending = pendingTenants.get(tenantId);
  if (pending) return await pending;

  const work = (async () => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new Error("租戶不存在，無法初始化");

    await seedTenantDefaultsBatched(tenant.id);
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: BASELINE_MARKER_ACTION,
        module: "system",
        detail: "已建立公司基礎資料：科目、倉庫、商品、庫存、客戶、供應商、範例單據與業態設定",
      },
    });
    readyTenants.add(tenant.id);
  })().finally(() => {
    pendingTenants.delete(tenantId);
  });

  pendingTenants.set(tenantId, work);
  return await work;
}
