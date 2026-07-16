import { prisma } from "./prisma";
import { seedTenantDefaults } from "./seed-tenant";

export const INTERNAL_ADMIN_COMPANY_CODE = "ERIN-INTERNAL";
export const INTERNAL_ADMIN_TENANT_NAME = "艾琳設計內部管理帳套";

/**
 * 平台超級管理員只在獨立內部帳套操作 ERP／POS 測試資料。
 * companyCode 的唯一索引讓多個同時登入請求仍只會建立一個帳套。
 */
export async function ensureInternalAdminTenant(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) throw new Error("僅平台超級管理員可使用內部管理帳套");

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

  await prisma.user.update({
    where: { id: userId },
    data: { tenantId: tenant.id },
  });

  await seedTenantDefaults(tenant.id);
  await prisma.companySetting.updateMany({
    where: { tenantId: tenant.id },
    data: { name: INTERNAL_ADMIN_TENANT_NAME },
  });

  return tenant;
}
