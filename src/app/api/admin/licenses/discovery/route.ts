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

  const hasServerUrl = Boolean(body.serverUrl?.trim());
  const hasCaCertificate = Boolean(body.caCertificate?.trim());
  if (hasServerUrl !== hasCaCertificate) {
    throw new ApiError(400, "若要人工設定公司主機，網址與 CA 憑證必須同時填寫");
  }

  const hasManualConnection = hasServerUrl && hasCaCertificate;
  const serverUrl = hasManualConnection ? normalizeServerUrl(body.serverUrl!.trim()) : null;
  const caCertificate = hasManualConnection ? validateCertificate(body.caCertificate!.trim()) : null;

  // 正常流程是先完成付款開通並交付啟用碼，再由客戶執行 Host 安裝包。
  // Host 安裝程式會自行偵測內網網址、讀取 Caddy CA，並呼叫
  // /api/license/register-server 回寫中央；客戶不應手動尋找這兩項資料。
  // 因此管理者在主機尚未安裝時勾選自動連線，不再阻擋授權開通。
  const pendingHostRegistration = body.enabled && !hasManualConnection;
  const discoveryEnabled = hasManualConnection ? body.enabled : false;

  const tenant = await prisma.tenant.update({
    where: { id: body.tenantId },
    data: {
      ...(hasManualConnection ? {
        discoveryServerUrl: serverUrl,
        discoveryCaCertificate: caCertificate,
      } : {}),
      discoveryEnabled,
      discoveryVersion: { increment: 1 },
      discoveryUpdatedAt: new Date(),
    },
    select: { discoveryEnabled: true, discoveryVersion: true },
  });
  await appendLicenseEvent({
    tenantId: body.tenantId,
    action: pendingHostRegistration ? "COMPANY_DISCOVERY_AWAITING_HOST" : "COMPANY_DISCOVERY_CONFIGURED",
    actorUserId: session.user.id,
    payload: {
      companyCode,
      serverUrl,
      enabled: discoveryEnabled,
      pendingHostRegistration,
      discoveryVersion: tenant.discoveryVersion,
    },
  });
  return NextResponse.json({
    ok: true,
    companyCode,
    ...tenant,
    pendingHostRegistration,
    message: pendingHostRegistration
      ? "授權可先完成；公司主機安裝後會自動回寫網址與 CA 憑證"
      : null,
  });
});
