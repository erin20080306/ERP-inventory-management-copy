import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import {
  appendLicenseEvent,
  createActivationKey,
  ensureTenantCompanyCode,
  hashActivationKey,
  invalidateLicenseAccessCache,
} from "@/lib/license";
import { prisma } from "@/lib/prisma";

const Input = z.object({
  tenantId: z.string().min(1),
  confirmation: z.literal("ROTATE_ACTIVATION_KEY"),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");

  const body = Input.parse(await req.json());
  const tenant = await prisma.tenant.findUnique({
    where: { id: body.tenantId },
    select: {
      id: true,
      name: true,
      isInternal: true,
      licenseStatus: true,
      licensePlan: true,
      licenseSeatLimit: true,
    },
  });
  if (!tenant) throw new ApiError(404, "找不到公司");
  if (tenant.isInternal) throw new ApiError(400, "平台管理者內部帳套不需要客戶啟用碼");
  if (tenant.licenseStatus !== "ACTIVE") throw new ApiError(409, "請先完成授權開通，再重發啟用碼");

  const companyCode = await ensureTenantCompanyCode(tenant.id);
  const activationKey = createActivationKey();
  const now = new Date();

  const revokedDevices = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`activation-key:${tenant.id}`}))`;
    await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        licenseKeyHash: hashActivationKey(activationKey),
        licenseKeyPrefix: activationKey.slice(0, 12),
        licenseVersion: { increment: 1 },
        licenseUpdatedAt: now,
        companyCode,
      },
    });
    const revoked = await tx.licenseDevice.updateMany({
      where: { tenantId: tenant.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return revoked.count;
  });

  await appendLicenseEvent({
    tenantId: tenant.id,
    action: "ACTIVATION_KEY_ROTATED",
    actorUserId: session.user.id,
    payload: {
      companyCode,
      revokedDevices,
      planCode: tenant.licensePlan,
      seatLimit: tenant.licenseSeatLimit,
      rotatedAt: now.toISOString(),
    },
  });
  invalidateLicenseAccessCache(tenant.id);

  return NextResponse.json({
    ok: true,
    companyCode,
    activationKey,
    revokedDevices,
    warning: "啟用碼只顯示這一次。舊啟用碼與既有裝置租約已失效。",
  });
});
