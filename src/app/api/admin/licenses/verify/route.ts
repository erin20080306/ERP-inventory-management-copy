import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { verifyLicenseEventChain, verifyLicensePaymentRecords } from "@/lib/license";
import { verifyAuditChain } from "@/lib/integrity";

const Input = z.object({ tenantId: z.string().min(1) });

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const body = Input.parse(await req.json());
  const [license, records, payments] = await Promise.all([
    verifyLicenseEventChain(body.tenantId),
    verifyAuditChain(body.tenantId),
    verifyLicensePaymentRecords(body.tenantId),
  ]);
  return NextResponse.json({ valid: license.valid && records.valid && payments.valid, license, records, payments });
});
