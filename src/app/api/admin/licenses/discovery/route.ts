import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { normalizeDiscoveryServerUrl, validateDiscoveryCaCertificate } from "@/lib/company-discovery";
import { appendLicenseEvent, ensureTenantCompanyCode } from "@/lib/license";
import { prisma } from "@/lib/prisma";

const Input = z.object({
  tenantId: z.string().min(1),
  serverUrl: z.string().trim().max(500).nullable().optional(),
  caCertificate: z.string().trim().max(30_000).nullable().optional(),
  enabled: z.boolean(),
});

function normalizeServerUrl(value: string) {
  try { return normalizeDiscoveryServerUrl(value); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "公司主機網址格式錯誤"); }
}

function validateCertificate(value: string) {
  try { return validateDiscoveryCaCertificate(value); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "CA 憑證格式錯誤"); }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const tenantId = z.string().min(1).parse(req.nextUrl.searchParams.get("tenantId"));
  const companyCode = await ensureTenantCompanyCode(tenantId);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { discoveryServerUrl: true, discoveryCaCertificate: true, discoveryEnabled: true, discoveryVersion: true, discoveryUpdatedAt: true },
  });
  if (!tenant) throw new ApiError(404, "找不到公司");
  return NextResponse.json({ companyCode, ...tenant });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const body = Input.parse(await req.json());
  const companyCode = await ensureTenantCompanyCode(body.tenantId);
  const serverUrl = body.serverUrl?.trim() ? normalizeServerUrl(body.serverUrl.trim()) : null;
  const caCertificate = body.caCertificate?.trim() ? validateCertificate(body.caCertificate) : null;
  if (body.enabled && (!serverUrl || !caCertificate)) throw new ApiError(400, "啟用自動連線前，必須填寫公司主機網址與 CA 憑證");

  const tenant = await prisma.tenant.update({
    where: { id: body.tenantId },
    data: {
      discoveryServerUrl: serverUrl,
      discoveryCaCertificate: caCertificate,
      discoveryEnabled: body.enabled,
      discoveryVersion: { increment: 1 },
      discoveryUpdatedAt: new Date(),
    },
    select: { discoveryEnabled: true, discoveryVersion: true },
  });
  await appendLicenseEvent({
    tenantId: body.tenantId,
    action: "COMPANY_DISCOVERY_CONFIGURED",
    actorUserId: session.user.id,
    payload: { companyCode, serverUrl, enabled: body.enabled, discoveryVersion: tenant.discoveryVersion },
  });
  return NextResponse.json({ ok: true, companyCode, ...tenant });
});
