import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  clearStorefrontMemberCookie,
  readStorefrontMemberSession,
  resolveStorefrontTenant,
} from "@/lib/storefront-members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PasswordInput = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string()
    .min(8, "新密碼至少需要 8 個字元")
    .max(72, "新密碼不可超過 72 個字元")
    .regex(/[A-Za-z]/, "新密碼至少需要一個英文字母")
    .regex(/[0-9]/, "新密碼至少需要一個數字"),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant, access } = await resolveStorefrontTenant(params.tenant);
  if (!access.allowed) throw new ApiError(403, access.reason || "此商城目前暫停會員服務");
  const session = await readStorefrontMemberSession(req, tenant.id);
  if (!session) throw new ApiError(401, "請先登入會員");
  const input = PasswordInput.parse(await req.json());
  if (!await bcrypt.compare(input.currentPassword, session.member.passwordHash)) {
    throw new ApiError(401, "目前密碼錯誤");
  }
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.$transaction([
    prisma.storefrontMember.update({
      where: { id: session.member.id },
      data: { passwordHash },
    }),
    prisma.storefrontMemberSession.deleteMany({
      where: { tenantId: tenant.id, memberId: session.member.id },
    }),
  ]);
  const response = NextResponse.json({ ok: true, message: "密碼已更新，請使用新密碼重新登入" });
  clearStorefrontMemberCookie(response, tenant.id);
  return response;
});
