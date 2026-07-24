import { prisma } from "./prisma";
import { seedTenantDefaultsBatched } from "./seed-tenant-batched";

export const INTERNAL_ADMIN_COMPANY_CODE = "ERIN-INTERNAL";
export const INTERNAL_ADMIN_TENANT_NAME = "艾琳設計內部管理帳套";
const REQUIRED_INTERNAL_CATALOGS = ["ERP", "POS_RETAIL", "POS_RESTAURANT", "ECOMMERCE"] as const;
const BASELINE_CHECK_TTL_MS = 5 * 60_000;
const baselineReadyUntil = new Map<string, number>();
const baselineRepairs = new Map<string, Promise<void>>();

async function ensureInternalAdminBaseline(tenantId: string) {
  if ((baselineReadyUntil.get(tenantId) ?? 0) > Date.now()) return;
  const running = baselineRepairs.get(tenantId);
  if (running) return await running;

  const repair = (async () => {
    const catalogs = await prisma.product.groupBy({
      by: ["catalogMode"],
      where: { tenantId, isArchived: false },
      _count: { _all: true },
    });
    const populated = new Set(
      catalogs
        .filter((catalog) => catalog._count._all > 0 && catalog.catalogMode)
        .map((catalog) => catalog.catalogMode),
    );
    const missingCatalog = REQUIRED_INTERNAL_CATALOGS.some((catalog) => !populated.has(catalog));
    if (missingCatalog) {
      // 可重入的基礎資料建立只補固定 SKU、倉庫與科目，不會覆寫客戶自行
      // 建立的商品價格、庫存或歷史交易。這也修復早期已建立但初始化中斷的內部帳套。
      await seedTenantDefaultsBatched(tenantId);
    }
    baselineReadyUntil.set(tenantId, Date.now() + BASELINE_CHECK_TTL_MS);
  })().finally(() => {
    baselineRepairs.delete(tenantId);
  });

  baselineRepairs.set(tenantId, repair);
  return await repair;
}

/**
 * 平台超級管理員只在獨立內部帳套操作 ERP／POS 測試資料。
 * companyCode 的唯一索引讓多個同時登入請求仍只會建立一個帳套。
 */
export async function ensureInternalAdminTenant(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true, isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) throw new Error("僅平台超級管理員可使用內部管理帳套");

  const existing = await prisma.tenant.findUnique({
    where: { companyCode: INTERNAL_ADMIN_COMPANY_CODE },
    select: { id: true, name: true, businessMode: true, companyCode: true },
  });
  if (existing) {
    if (user.tenantId !== existing.id) {
      await prisma.user.update({ where: { id: userId }, data: { tenantId: existing.id } });
    }
    await ensureInternalAdminBaseline(existing.id);
    return existing;
  }

  const tenant = await prisma.tenant.upsert({
    where: { companyCode: INTERNAL_ADMIN_COMPANY_CODE },
    update: {
      name: INTERNAL_ADMIN_TENANT_NAME,
      businessMode: "POS_RESTAURANT",
      isInternal: true,
    },
    create: {
      name: INTERNAL_ADMIN_TENANT_NAME,
      businessMode: "POS_RESTAURANT",
      isInternal: true,
      companyCode: INTERNAL_ADMIN_COMPANY_CODE,
      licenseStatus: "ACTIVE",
      licenseBilling: "ONCE",
      licenseActivatedAt: new Date(),
    },
    select: { id: true, name: true, businessMode: true, companyCode: true },
  });

  if (user.tenantId !== tenant.id) {
    await prisma.user.update({ where: { id: userId }, data: { tenantId: tenant.id } });
  }

  await seedTenantDefaultsBatched(tenant.id);
  await prisma.companySetting.updateMany({
    where: { tenantId: tenant.id },
    data: { name: INTERNAL_ADMIN_TENANT_NAME },
  });
  baselineReadyUntil.set(tenant.id, Date.now() + BASELINE_CHECK_TTL_MS);

  return tenant;
}
