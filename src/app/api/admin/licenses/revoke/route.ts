import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { revokeTenantLicense } from "@/lib/license";

const Input = z.object({ tenantId: z.string().min(1), confirmation: z.literal("REVOKE") });

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const body = Input.parse(await req.json());
  await revokeTenantLicense(body.tenantId, session.user.id);
  return NextResponse.json({ ok: true });
});
