import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  allowStorefrontMemberAttempt,
  createStorefrontMemberSession,
  resolveStorefrontTenant,
  setStorefrontMemberCookie,
} from "@/lib/storefront-members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginInput = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(72),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant, access } = await resolveStorefrontTenant(params.tenant);
  if (!access.allowed) throw new ApiError(403, access.reason || "此商城目前暫停會員登入");
  if (!allowStorefrontMemberAttempt(req, tenant.id, "login")) {
    throw new ApiError(429, "登入嘗試過於頻繁，請稍後再試");
  }
  const input = LoginInput.parse(await req.json());
  const email = input.email.toLowerCase();
  const member = await prisma.storefrontMember.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    include: { customer: { select: { isActive: true } } },
  });
  const passwordMatches = member ? await bcrypt.compare(input.password, member.passwordHash) : false;
  if (!member || !passwordMatches) throw new ApiError(401, "Email 或密碼錯誤");
  if (!member.isActive || !member.customer.isActive) throw new ApiError(403, "會員帳號已停用，請聯絡商家");

  const session = await createStorefrontMemberSession(tenant.id, member.id);
  await prisma.storefrontMember.update({ where: { id: member.id }, data: { lastLoginAt: new Date() } });
  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    member: {
      name: member.name,
      email: member.email,
      phone: member.phone,
      joinedAt: member.createdAt.toISOString(),
    },
  });
  setStorefrontMemberCookie(response, tenant.id, session.token, session.expiresAt);
  return response;
});
