import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import {
  clearStorefrontMemberCookie,
  resolveStorefrontTenant,
  revokeStorefrontMemberSession,
} from "@/lib/storefront-members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant } = await resolveStorefrontTenant(params.tenant);
  await revokeStorefrontMemberSession(req, tenant.id);
  const response = NextResponse.json({ ok: true });
  clearStorefrontMemberCookie(response, tenant.id);
  return response;
});
