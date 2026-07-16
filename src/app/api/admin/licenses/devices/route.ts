import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { appendLicenseEvent } from "@/lib/license";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const tenantId = z.string().min(1).parse(req.nextUrl.searchParams.get("tenantId"));
  const rows = await prisma.licenseDevice.findMany({ where: { tenantId }, orderBy: { lastSeenAt: "desc" }, select: { id: true, deviceRole: true, displayName: true, platform: true, appVersion: true, firstSeenAt: true, lastSeenAt: true, revokedAt: true } });
  return NextResponse.json({ rows });
});

const Revoke = z.object({ tenantId: z.string().min(1), deviceId: z.string().min(1) });

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const body = Revoke.parse(await req.json());
  const result = await prisma.licenseDevice.updateMany({ where: { id: body.deviceId, tenantId: body.tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!result.count) throw new ApiError(404, "找不到可撤銷的裝置");
  await appendLicenseEvent({ tenantId: body.tenantId, action: "DEVICE_REVOKED", actorUserId: session.user.id, payload: { deviceId: body.deviceId } });
  return NextResponse.json({ ok: true });
});
