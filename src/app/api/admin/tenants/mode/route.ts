import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requireAuth } from "@/lib/api";
import {
  appendLicenseEvent,
  ensureTenantCompanyCode,
  invalidateLicenseAccessCache,
} from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { seedTenantDefaults } from "@/lib/seed-tenant";

const BusinessMode = z.enum(["ERP", "POS_RETAIL", "POS_RESTAURANT", "ECOMMERCE", "POS_MEDICAL"]);
const Input = z.object({
  tenantId: z.string().min(1),
  businessMode: BusinessMode,
  confirmationName: z.string().trim().max(200).optional(),
  preserveData: z.boolean().optional(),
});

async function requireSuperAdmin() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  return session;
}

async function transitionPreview(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      businessMode: true,
      licenseVersion: true,
      companyCode: true,
      _count: {
        select: {
          products: true,
          customers: true,
          suppliers: true,
          salesOrders: true,
          purchaseOrders: true,
          inventoryTxns: true,
          journalEntries: true,
          fixedAssets: true,
          posSales: true,
          restaurantOrders: true,
          storefrontMembers: true,
          storefrontPayments: true,
        },
      },
    },
  });
  if (!tenant) throw new ApiError(404, "找不到租戶");
  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    currentMode: normalizeBusinessMode(tenant.businessMode),
    licenseVersion: tenant.licenseVersion,
    companyCode: tenant.companyCode,
    records: tenant._count,
    protections: {
      tenantIdUnchanged: true,
      activationKeyUnchanged: true,
      companyCodeUnchanged: true,
      accountingDataPreserved: true,
      inventoryDataPreserved: true,
      transactionHistoryPreserved: true,
      reinstallRequired: false,
    },
  };
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requireSuperAdmin();
  const tenantId = req.nextUrl.searchParams.get("tenantId")?.trim() || "";
  if (!tenantId) throw new ApiError(400, "缺少租戶識別");
  return NextResponse.json(await transitionPreview(tenantId));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireSuperAdmin();
  const body = Input.parse(await req.json());
  const preview = await transitionPreview(body.tenantId);
  if (preview.currentMode === body.businessMode) {
    return NextResponse.json({ ok: true, changed: false, preview });
  }
  if (body.preserveData !== true) {
    throw new ApiError(400, "必須確認保留原有商品、庫存、交易與會計資料");
  }
  if (body.confirmationName !== preview.tenantName) {
    throw new ApiError(400, "請輸入目前完整公司名稱以確認業態轉換");
  }

  const changedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.tenantId}))`;
    const current = await tx.tenant.findUnique({
      where: { id: body.tenantId },
      select: { name: true, businessMode: true },
    });
    if (!current) throw new ApiError(404, "找不到租戶");
    if (current.name !== body.confirmationName) {
      throw new ApiError(409, "公司名稱已變更，請重新載入後再確認");
    }
    if (normalizeBusinessMode(current.businessMode) === body.businessMode) {
      return { changed: false, previousMode: body.businessMode, licenseVersion: preview.licenseVersion };
    }

    const tenant = await tx.tenant.update({
      where: { id: body.tenantId },
      data: {
        businessMode: body.businessMode,
        licenseVersion: { increment: 1 },
        licenseUpdatedAt: changedAt,
      },
      select: { licenseVersion: true },
    });

    if (body.businessMode === "POS_RESTAURANT") {
      const area = await tx.restaurantArea.upsert({
        where: { tenantId_code: { tenantId: body.tenantId, code: "DINING" } },
        update: { isActive: true },
        create: { tenantId: body.tenantId, code: "DINING", name: "用餐區", sortOrder: 1 },
      });
      for (let index = 1; index <= 8; index += 1) {
        const code = `T${String(index).padStart(2, "0")}`;
        await tx.restaurantTable.upsert({
          where: { tenantId_code: { tenantId: body.tenantId, code } },
          update: { areaId: area.id, isActive: true },
          create: {
            tenantId: body.tenantId,
            areaId: area.id,
            code,
            name: `${index} 號桌`,
            seats: index <= 2 ? 2 : 4,
            sortOrder: index,
          },
        });
      }
    }
    return {
      changed: true,
      previousMode: normalizeBusinessMode(current.businessMode),
      licenseVersion: tenant.licenseVersion,
    };
  });

  if (!updated.changed) return NextResponse.json({ ok: true, changed: false, preview });
  await seedTenantDefaults(body.tenantId);
  const companyCode = body.businessMode === "ECOMMERCE" || body.businessMode === "POS_MEDICAL"
    ? await ensureTenantCompanyCode(body.tenantId)
    : preview.companyCode;
  await appendLicenseEvent({
    tenantId: body.tenantId,
    actorUserId: session.user.id,
    action: "BUSINESS_MODE_CHANGED",
    payload: {
      previousMode: updated.previousMode,
      businessMode: body.businessMode,
      preserveData: true,
      protectedRecordCounts: preview.records,
      licenseVersion: updated.licenseVersion,
      changedAt: changedAt.toISOString(),
    },
  });
  await audit({
    userId: session.user.id,
    action: "change_business_mode",
    module: "admin.tenants",
    refId: body.tenantId,
    detail: JSON.stringify({
      previousMode: updated.previousMode,
      businessMode: body.businessMode,
      preserveData: true,
      protectedRecordCounts: preview.records,
    }),
  });
  invalidateLicenseAccessCache(body.tenantId);
  return NextResponse.json({
    ok: true,
    changed: true,
    companyCode,
    licenseVersion: updated.licenseVersion,
    previousMode: updated.previousMode,
    businessMode: body.businessMode,
    protections: preview.protections,
  });
});
