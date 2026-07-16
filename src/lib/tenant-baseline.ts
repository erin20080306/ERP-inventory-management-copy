import { prisma } from "./prisma";
import { seedTenantDefaults } from "./seed-tenant";

const BASELINE_MARKER_ACTION = "tenant_baseline_v2_seeded";
const readyTenants = new Set<string>();
const pendingTenants = new Map<string, Promise<void>>();

/**
 * 確保公司帳套具有與平台管理者相同的基礎初始化流程。
 *
 * - 新租戶註冊時立即建立。
 * - 舊租戶（包含胖鴨公司）在下一次登入／Session 更新時自動補齊。
 * - 實際商品範例仍依 ERP、零售 POS、餐飲 POS 業態建立，避免不相關商品
 *   出現在客戶的操作畫面。
 * - AuditLog 作為一次性版本標記；使用者之後自行刪除範例資料時不會被重建。
 */
export async function ensureTenantBaseline(tenantId: string | null | undefined) {
  if (!tenantId || readyTenants.has(tenantId)) return;

  const pending = pendingTenants.get(tenantId);
  if (pending) return await pending;

  const work = (async () => {
    const marker = await prisma.auditLog.findFirst({
      where: { tenantId, action: BASELINE_MARKER_ACTION },
      select: { id: true },
    });
    if (marker) {
      readyTenants.add(tenantId);
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, isInternal: true },
    });
    if (!tenant) return;

    await seedTenantDefaults(tenant.id);
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
