import { prisma } from "@/lib/prisma";
import { normalizeStoreSlug } from "@/lib/storefront-branding";

export const MEDICAL_DEMO_SERVICES = [
  { code: "MED-CONSULT", sku: "MED-SVC-001", name: "專業肌膚諮詢", category: "諮詢評估", durationMinutes: 40, price: 1200, imageUrl: "/medical-aesthetics/treatment-planning.png", bodyArea: "臉部", consentRequired: false },
  { code: "MED-HYDRATION", sku: "MED-SVC-002", name: "深層水潤修護", category: "肌膚管理", durationMinutes: 60, price: 3600, imageUrl: "/medical-aesthetics/hydration-care.png", bodyArea: "臉部", consentRequired: true },
  { code: "MED-LIGHT", sku: "MED-SVC-003", name: "光感亮膚管理", category: "光電療程", durationMinutes: 75, price: 4800, imageUrl: "/medical-aesthetics/light-care.png", bodyArea: "臉部", equipmentName: "光感護理設備", consentRequired: true },
  { code: "MED-RENEW", sku: "MED-SVC-004", name: "煥膚管理療程", category: "肌膚管理", durationMinutes: 70, price: 4200, imageUrl: "/medical-aesthetics/skin-consultation.png", bodyArea: "臉部", consentRequired: true },
] as const;

export const MEDICAL_DEMO_CONSUMABLES = [
  { sku: "MED-CON-001", name: "水潤修護安瓶", cost: 180, quantity: 120 },
  { sku: "MED-CON-002", name: "一次性護理耗材包", cost: 90, quantity: 160 },
  { sku: "MED-CON-003", name: "舒緩修護面膜", cost: 120, quantity: 100 },
] as const;

export const MEDICAL_DEMO_PACKAGES = [
  { code: "MED-PKG-HYDRA-6", sku: "MED-PKG-001", name: "水潤修護 6 堂套票", serviceCode: "MED-HYDRATION", sessions: 6, validDays: 365, price: 18_800, imageUrl: "/medical-aesthetics/hydration-care.png" },
  { code: "MED-PKG-LIGHT-6", sku: "MED-PKG-002", name: "光感亮膚 6 堂套票", serviceCode: "MED-LIGHT", sessions: 6, validDays: 365, price: 25_800, imageUrl: "/medical-aesthetics/light-care.png" },
] as const;

const CONSUMABLE_RECIPES: Record<string, Array<{ sku: string; quantity: number }>> = {
  "MED-HYDRATION": [{ sku: "MED-CON-001", quantity: 1 }, { sku: "MED-CON-002", quantity: 1 }, { sku: "MED-CON-003", quantity: 1 }],
  "MED-LIGHT": [{ sku: "MED-CON-001", quantity: 1 }, { sku: "MED-CON-002", quantity: 1 }],
  "MED-RENEW": [{ sku: "MED-CON-002", quantity: 1 }, { sku: "MED-CON-003", quantity: 1 }],
};

const medicalBaselineReadyUntil = new Map<string, number>();
const MEDICAL_BASELINE_READY_TTL_MS = 5 * 60_000;

export async function ensureMedicalAestheticsBaseline(tenantId: string) {
  if ((medicalBaselineReadyUntil.get(tenantId) ?? 0) > Date.now()) {
    return { initialized: false, cached: true };
  }
  const [serviceCount, packageCount, consumableCount, register] = await Promise.all([
    prisma.medicalService.count({ where: { tenantId } }),
    prisma.medicalTreatmentPackage.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId, catalogMode: "POS_MEDICAL", trackInventory: true } }),
    prisma.posRegister.findFirst({ where: { tenantId, code: "MED-01" }, select: { id: true, warehouseId: true } }),
  ]);
  if (
    serviceCount >= MEDICAL_DEMO_SERVICES.length
    && packageCount >= MEDICAL_DEMO_PACKAGES.length
    && consumableCount >= MEDICAL_DEMO_CONSUMABLES.length
    && register
  ) {
    medicalBaselineReadyUntil.set(tenantId, Date.now() + MEDICAL_BASELINE_READY_TTL_MS);
    return { warehouseId: register.warehouseId, services: serviceCount, initialized: false };
  }

  const result = await prisma.$transaction(async (tx) => {
    const [tenant, websiteSettings] = await Promise.all([
      tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      tx.companySetting.findFirst({ where: { tenantId }, select: { id: true, name: true, storeSlug: true, storeName: true } }),
    ]);
    if (!tenant) throw new Error("找不到醫美租戶");
    const defaultSiteSlug = normalizeStoreSlug(`medical-${tenantId}`);
    if (websiteSettings) {
      if (!websiteSettings.storeSlug || !websiteSettings.storeName) {
        await tx.companySetting.update({
          where: { id: websiteSettings.id },
          data: {
            storeSlug: websiteSettings.storeSlug || defaultSiteSlug,
            storeName: websiteSettings.storeName || websiteSettings.name || tenant.name,
          },
        });
      }
    } else {
      await tx.companySetting.create({
        data: {
          tenantId,
          name: tenant.name,
          storeName: tenant.name,
          storeSlug: defaultSiteSlug,
          currency: "TWD",
        },
      });
    }

    const [serviceCategory, consumableCategory, packageCategory, sessionUnit, itemUnit, exemptTax] = await Promise.all([
      tx.productCategory.upsert({ where: { tenantId_code: { tenantId, code: "MED-SERVICE" } }, update: { name: "醫美服務" }, create: { tenantId, code: "MED-SERVICE", name: "醫美服務" } }),
      tx.productCategory.upsert({ where: { tenantId_code: { tenantId, code: "MED-CONSUMABLE" } }, update: { name: "醫美耗材" }, create: { tenantId, code: "MED-CONSUMABLE", name: "醫美耗材" } }),
      tx.productCategory.upsert({ where: { tenantId_code: { tenantId, code: "MED-PACKAGE" } }, update: { name: "療程套票" }, create: { tenantId, code: "MED-PACKAGE", name: "療程套票" } }),
      tx.productUnit.upsert({ where: { tenantId_code: { tenantId, code: "SESSION" } }, update: { name: "堂" }, create: { tenantId, code: "SESSION", name: "堂" } }),
      tx.productUnit.upsert({ where: { tenantId_code: { tenantId, code: "ITEM" } }, update: { name: "件" }, create: { tenantId, code: "ITEM", name: "件" } }),
      tx.taxRate.upsert({ where: { tenantId_code: { tenantId, code: "MED-EXEMPT" } }, update: { name: "醫療勞務免稅", rate: 0, isActive: true }, create: { tenantId, code: "MED-EXEMPT", name: "醫療勞務免稅", rate: 0, isActive: true } }),
    ]);

    const warehouse = await tx.warehouse.upsert({ where: { tenantId_code: { tenantId, code: "MED-MAIN" } }, update: { name: "醫美主庫", isActive: true }, create: { tenantId, code: "MED-MAIN", name: "醫美主庫", isActive: true } });
    await tx.posRegister.upsert({ where: { tenantId_code: { tenantId, code: "MED-01" } }, update: { name: "醫美櫃台", mode: "POS_MEDICAL", warehouseId: warehouse.id, isActive: true }, create: { tenantId, code: "MED-01", name: "醫美櫃台", mode: "POS_MEDICAL", warehouseId: warehouse.id, isActive: true } });

    const consumableProducts = new Map<string, { id: string }>();
    for (const definition of MEDICAL_DEMO_CONSUMABLES) {
      const product = await tx.product.upsert({
        where: { tenantId_sku: { tenantId, sku: definition.sku } },
        update: { name: definition.name, catalogMode: "POS_MEDICAL", categoryId: consumableCategory.id, unitId: itemUnit.id, costPrice: definition.cost, salePrice: 0, imageUrl: "/medical-aesthetics/clinic-consumables.png", trackInventory: true, isActive: true, isPublished: false, isArchived: false },
        create: { tenantId, sku: definition.sku, name: definition.name, catalogMode: "POS_MEDICAL", categoryId: consumableCategory.id, unitId: itemUnit.id, costPrice: definition.cost, salePrice: 0, safetyStock: 20, imageUrl: "/medical-aesthetics/clinic-consumables.png", trackInventory: true, isActive: true, isPublished: false },
        select: { id: true },
      });
      consumableProducts.set(definition.sku, product);
      await tx.inventoryStock.upsert({ where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } }, update: {}, create: { tenantId, productId: product.id, warehouseId: warehouse.id, quantity: definition.quantity } });
    }

    const services = new Map<string, { id: string; productId: string }>();
    for (const definition of MEDICAL_DEMO_SERVICES) {
      const product = await tx.product.upsert({
        where: { tenantId_sku: { tenantId, sku: definition.sku } },
        update: { name: definition.name, catalogMode: "POS_MEDICAL", categoryId: serviceCategory.id, unitId: sessionUnit.id, taxRateId: exemptTax.id, salePrice: definition.price, imageUrl: definition.imageUrl, trackInventory: false, isActive: true, isPublished: true, isArchived: false },
        create: { tenantId, sku: definition.sku, name: definition.name, catalogMode: "POS_MEDICAL", categoryId: serviceCategory.id, unitId: sessionUnit.id, taxRateId: exemptTax.id, salePrice: definition.price, imageUrl: definition.imageUrl, trackInventory: false, isActive: true, isPublished: true },
        select: { id: true },
      });
      const service = await tx.medicalService.upsert({
        where: { productId: product.id },
        update: { code: definition.code, category: definition.category, durationMinutes: definition.durationMinutes, bodyArea: definition.bodyArea, equipmentName: "equipmentName" in definition ? definition.equipmentName : null, consentRequired: definition.consentRequired, imageUrl: definition.imageUrl, isActive: true },
        create: { tenantId, productId: product.id, code: definition.code, category: definition.category, durationMinutes: definition.durationMinutes, bodyArea: definition.bodyArea, equipmentName: "equipmentName" in definition ? definition.equipmentName : null, consentRequired: definition.consentRequired, imageUrl: definition.imageUrl },
        select: { id: true, productId: true },
      });
      services.set(definition.code, service);
    }

    for (const [serviceCode, recipe] of Object.entries(CONSUMABLE_RECIPES)) {
      const service = services.get(serviceCode);
      if (!service) continue;
      for (const line of recipe) {
        const consumable = consumableProducts.get(line.sku);
        if (!consumable) continue;
        await tx.medicalServiceConsumable.upsert({ where: { serviceId_productId: { serviceId: service.id, productId: consumable.id } }, update: { quantity: line.quantity, unit: "件" }, create: { serviceId: service.id, productId: consumable.id, quantity: line.quantity, unit: "件" } });
      }
    }

    for (const definition of MEDICAL_DEMO_PACKAGES) {
      const service = services.get(definition.serviceCode);
      if (!service) continue;
      const product = await tx.product.upsert({
        where: { tenantId_sku: { tenantId, sku: definition.sku } },
        update: { name: definition.name, catalogMode: "POS_MEDICAL", categoryId: packageCategory.id, unitId: itemUnit.id, taxRateId: exemptTax.id, salePrice: definition.price, imageUrl: definition.imageUrl, trackInventory: false, isActive: true, isPublished: true, isArchived: false },
        create: { tenantId, sku: definition.sku, name: definition.name, catalogMode: "POS_MEDICAL", categoryId: packageCategory.id, unitId: itemUnit.id, taxRateId: exemptTax.id, salePrice: definition.price, imageUrl: definition.imageUrl, trackInventory: false, isActive: true, isPublished: true },
        select: { id: true },
      });
      await tx.medicalTreatmentPackage.upsert({
        where: { productId: product.id },
        update: { serviceId: service.id, code: definition.code, name: definition.name, sessions: definition.sessions, validDays: definition.validDays, imageUrl: definition.imageUrl, isActive: true },
        create: { tenantId, productId: product.id, serviceId: service.id, code: definition.code, name: definition.name, sessions: definition.sessions, validDays: definition.validDays, imageUrl: definition.imageUrl },
      });
    }
    return { warehouseId: warehouse.id, services: services.size, initialized: true };
  });
  medicalBaselineReadyUntil.set(tenantId, Date.now() + MEDICAL_BASELINE_READY_TTL_MS);
  return result;
}
