import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler } from "@/lib/api";
import { nextNumberInTransaction } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import {
  allowStorefrontMemberAttempt,
  createStorefrontMemberSession,
  resolveStorefrontTenant,
  setStorefrontMemberCookie,
} from "@/lib/storefront-members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RegisterInput = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(80),
  email: z.string().trim().email("Email 格式不正確").max(200),
  phone: z.string().trim().min(6, "請輸入有效手機").max(30),
  password: z.string()
    .min(8, "密碼至少需要 8 個字元")
    .max(72, "密碼不可超過 72 個字元")
    .regex(/[A-Za-z]/, "密碼至少需要一個英文字母")
    .regex(/[0-9]/, "密碼至少需要一個數字"),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant, access } = await resolveStorefrontTenant(params.tenant);
  if (!access.allowed) throw new ApiError(403, access.reason || "此商城目前暫停會員註冊");
  if (!allowStorefrontMemberAttempt(req, tenant.id, "register")) {
    throw new ApiError(429, "註冊嘗試過於頻繁，請 15 分鐘後再試");
  }
  const input = RegisterInput.parse(await req.json());
  const email = input.email.toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 12);

  const member = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`storefront-register:${tenant.id}:${email}`}))`;
    const [existingMember, existingCustomer] = await Promise.all([
      tx.storefrontMember.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } }, select: { id: true } }),
      tx.customer.findFirst({
        where: { tenantId: tenant.id, email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      }),
    ]);
    if (existingMember) throw new ApiError(409, "此 Email 已註冊，請直接登入");
    // 未完成 Email 驗證前不可直接接管既有 ERP 客戶與歷史訂單。
    if (existingCustomer) throw new ApiError(409, "此 Email 已存在於商家資料，請聯絡商家協助啟用會員");

    const customerCode = await nextNumberInTransaction(tx, "WEB-C", tenant.id);
    const customer = await tx.customer.create({
      data: {
        tenantId: tenant.id,
        code: customerCode,
        companyName: input.name,
        contactName: input.name,
        phone: input.phone,
        email,
        remark: "由品牌官網會員註冊建立",
      },
    });
    return tx.storefrontMember.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        email,
        passwordHash,
        name: input.name,
        phone: input.phone,
      },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    });
  });

  const session = await createStorefrontMemberSession(tenant.id, member.id);
  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    member: {
      name: member.name,
      email: member.email,
      phone: member.phone,
      joinedAt: member.createdAt.toISOString(),
    },
  }, { status: 201 });
  setStorefrontMemberCookie(response, tenant.id, session.token, session.expiresAt);
  return response;
});
