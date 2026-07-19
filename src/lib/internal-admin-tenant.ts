import { prisma } from "./prisma";
import { seedTenantDefaultsBatched } from "./seed-tenant-batched";

export const INTERNAL_ADMIN_COMPANY_CODE = "ERIN-INTERNAL";
export const INTERNAL_ADMIN_TENANT_NAME = "艾琳設計內部管理帳套";

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

  // 正常登入走快速路徑。初始化只在帳套第一次建立時執行，並使用批次寫入。
  const existing = await prisma.tenant.findUnique({
    where: { companyCode: INTERNAL_ADMIN_COMPANY_CODE },
    select: { id: true, name: true, businessMode: true },
  });
  if (existing) {
    if (user.tenantId !== existing.id) {
      await prisma.user.update({ where: { id: userId }, data: { tenantId: existing.id } });
    }
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
    select: { id: true, name: true, businessMode: true },
  });

  if (user.tenantId !== tenant.id) {
    await prisma.user.update({ where: { id: userId }, data: { tenantId: tenant.id } });
  }

  await seedTenantDefaultsBatched(tenant.id);
  await prisma.companySetting.updateMany({
    where: { tenantId: tenant.id },
    data: { name: INTERNAL_ADMIN_TENANT_NAME },
  });

  return tenant;
}
