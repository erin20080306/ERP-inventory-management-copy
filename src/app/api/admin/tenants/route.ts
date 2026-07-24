import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { computeLicenseAccess, TRIAL_DAYS } from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { BASELINE_FAILED_ACTION, BASELINE_MARKER_ACTION, BASELINE_STARTED_ACTION } from "@/lib/tenant-baseline";
import type { Prisma } from "@prisma/client";

function parseInitializationDetail(detail: string | null) {
  if (!detail) return {} as Record<string, unknown>;
  try {
    return JSON.parse(detail) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(10, Number(req.nextUrl.searchParams.get("pageSize") || 20)));
  const search = (req.nextUrl.searchParams.get("q") || "").trim();
  const mode = req.nextUrl.searchParams.get("mode");
  const where: Prisma.TenantWhereInput = {
    isInternal: false,
    ...(mode === "ERP" ? { businessMode: "ERP" } : mode === "POS" ? { businessMode: { in: ["POS", "POS_RETAIL", "POS_RESTAURANT"] } } : mode === "ECOMMERCE" ? { businessMode: "ECOMMERCE" } : mode === "MEDICAL" ? { businessMode: "POS_MEDICAL" } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { users: { some: { OR: [
          { username: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ] } } },
      ],
    } : {}),
  };

  const [total, tenants, totalUsers, erpCount, posCount, ecommerceCount, medicalCount, activeCount, pendingInquiries, pendingInquiryCount] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        businessMode: true,
        createdAt: true,
        licensePlan: true,
        licenseBilling: true,
        licenseStatus: true,
        licenseSeatLimit: true,
        licenseActivatedAt: true,
        licenseExpiresAt: true,
        licenseKeyHash: true,
        licenseKeyPrefix: true,
        licenseVersion: true,
        licenseMaintenanceEnd: true,
        companyCode: true,
        discoveryServerUrl: true,
        discoveryEnabled: true,
        discoveryVersion: true,
        users: {
          where: { isSuperAdmin: false },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            username: true,
            name: true,
            email: true,
            isPaid: true,
            paymentType: true,
            subscriptionEnd: true,
            registrationIp: true,
          },
        },
        licenseDevices: { where: { revokedAt: null }, select: { deviceRole: true } },
        licensePayments: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, planCode: true, billing: true, quotedAmount: true, paidAmount: true, paymentMethod: true, paymentReference: true, paidAt: true, createdAt: true },
        },
        _count: { select: { users: true, salesOrders: true, posSales: true } },
      },
    }),
    prisma.user.count({ where: { isSuperAdmin: false, tenant: { is: { isInternal: false } } } }),
    prisma.tenant.count({ where: { isInternal: false, businessMode: "ERP" } }),
    prisma.tenant.count({ where: { isInternal: false, businessMode: { in: ["POS", "POS_RETAIL", "POS_RESTAURANT"] } } }),
    prisma.tenant.count({ where: { isInternal: false, businessMode: "ECOMMERCE" } }),
    prisma.tenant.count({ where: { isInternal: false, businessMode: "POS_MEDICAL" } }),
    prisma.tenant.count({ where: { isInternal: false, licenseStatus: "ACTIVE" } }),
    prisma.planInquiry.findMany({
      where: { status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, email: true, company: true, lineId: true, businessMode: true, planCode: true, billing: true, notes: true, notificationStatus: true, createdAt: true },
    }),
    prisma.planInquiry.count({ where: { status: "NEW" } }),
  ]);

  const initializationLogs = tenants.length > 0
    ? await prisma.auditLog.findMany({
        where: {
          tenantId: { in: tenants.map((tenant) => tenant.id) },
          action: { in: [BASELINE_STARTED_ACTION, BASELINE_MARKER_ACTION, BASELINE_FAILED_ACTION] },
        },
        orderBy: { createdAt: "desc" },
        select: { tenantId: true, action: true, detail: true, createdAt: true },
      })
    : [];

  const initializationByTenant = new Map<string, typeof initializationLogs>();
  for (const log of initializationLogs) {
    if (!log.tenantId) continue;
    const rows = initializationByTenant.get(log.tenantId) ?? [];
    rows.push(log);
    initializationByTenant.set(log.tenantId, rows);
  }

  return NextResponse.json({
    rows: tenants.map((tenant) => {
      const owner = tenant.users[0] ?? null;
      const access = computeLicenseAccess({
        tenantCreatedAt: tenant.createdAt,
        licensePlan: tenant.licensePlan,
        licenseBilling: tenant.licenseBilling,
        licenseStatus: tenant.licenseStatus,
        licenseSeatLimit: tenant.licenseSeatLimit,
        licenseActivatedAt: tenant.licenseActivatedAt,
        licenseExpiresAt: tenant.licenseExpiresAt,
        licenseKeyHash: tenant.licenseKeyHash,
        licenseVersion: tenant.licenseVersion,
        legacyIsPaid: owner?.isPaid,
        legacyPaymentType: owner?.paymentType,
        legacySubscriptionEnd: owner?.subscriptionEnd,
      });

      const logs = initializationByTenant.get(tenant.id) ?? [];
      const completedLog = logs.find((log) => log.action === BASELINE_MARKER_ACTION);
      const failedLog = logs.find((log) => log.action === BASELINE_FAILED_ACTION);
      const startedLog = logs.find((log) => log.action === BASELINE_STARTED_ACTION);
      const failedAfterStarted = Boolean(
        failedLog && (!startedLog || failedLog.createdAt.getTime() >= startedLog.createdAt.getTime()),
      );
      const initializationStatus = completedLog ? "READY" : failedAfterStarted ? "FAILED" : startedLog ? "RUNNING" : "PENDING";
      const activeLog = completedLog ?? (failedAfterStarted ? failedLog : startedLog);
      const initializationDetail = parseInitializationDetail(activeLog?.detail ?? null);
      const trialExpiresAt = new Date(tenant.createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      return {
        id: tenant.id,
        name: tenant.name,
        businessMode: normalizeBusinessMode(tenant.businessMode),
        createdAt: tenant.createdAt,
        owner: owner ? {
          username: owner.username,
          name: owner.name,
          email: owner.email,
          registrationIp: owner.registrationIp,
        } : null,
        userCount: tenant._count.users,
        deviceCount: tenant.licenseDevices.filter((device) => device.deviceRole === "WORKSTATION").length,
        serverCount: tenant.licenseDevices.filter((device) => device.deviceRole === "SERVER").length,
        transactionCount: tenant._count.salesOrders + tenant._count.posSales,
        payments: tenant.licensePayments.map((payment) => ({
          ...payment,
          quotedAmount: payment.quotedAmount.toString(),
          paidAmount: payment.paidAmount.toString(),
        })),
        initialization: {
          status: initializationStatus,
          startedAt: typeof initializationDetail.startedAt === "string"
            ? initializationDetail.startedAt
            : startedLog?.createdAt.toISOString() ?? null,
          completedAt: typeof initializationDetail.completedAt === "string"
            ? initializationDetail.completedAt
            : completedLog?.createdAt.toISOString() ?? null,
          failedAt: typeof initializationDetail.failedAt === "string"
            ? initializationDetail.failedAt
            : failedLog?.createdAt.toISOString() ?? null,
          durationMs: typeof initializationDetail.durationMs === "number" ? initializationDetail.durationMs : null,
        },
        trial: {
          startedAt: tenant.createdAt,
          expiresAt: trialExpiresAt,
          registrationIp: owner?.registrationIp ?? null,
        },
        license: {
          ...access,
          keyPrefix: tenant.licenseKeyPrefix,
          maintenanceEnd: tenant.licenseMaintenanceEnd,
        },
        connection: {
          companyCode: tenant.companyCode,
          serverUrl: tenant.discoveryServerUrl,
          enabled: tenant.discoveryEnabled,
          version: tenant.discoveryVersion,
        },
      };
    }),
    inquiries: pendingInquiries,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    stats: { totalTenants: erpCount + posCount + ecommerceCount + medicalCount, totalUsers, erpCount, posCount, ecommerceCount, medicalCount, activeCount, pendingInquiryCount },
  });
});

export const DELETE = apiHandler(async () => {
  throw new ApiError(405, "批次刪除已停用；公司資料必須經備份與人工確認後個別處理");
});
