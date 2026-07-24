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

const UpdateMemberInput = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(80),
  email: z.string().trim().email("Email 格式不正確").max(200),
  phone: z.string().trim().min(6, "請輸入有效手機").max(30),
  currentPassword: z.string().max(72).optional(),
});

const DeleteMemberInput = z.object({
  password: z.string().min(1).max(72),
  confirmation: z.literal("DELETE"),
});

export const GET = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant } = await resolveStorefrontTenant(params.tenant);
  const session = await readStorefrontMemberSession(req, tenant.id);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }
  const now = new Date();
  const [orders, orderCount, couponCount] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { tenantId: tenant.id, customerId: session.member.customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        number: true,
        status: true,
        total: true,
        createdAt: true,
        _count: { select: { items: true } },
        storefrontPayment: {
          select: { method: true, status: true, paidAt: true, refundedAmount: true },
        },
      },
    }),
    prisma.salesOrder.count({
      where: { tenantId: tenant.id, customerId: session.member.customerId },
    }),
    prisma.posCoupon.count({
      where: {
        tenantId: tenant.id,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
    }),
  ]);
  return NextResponse.json({
    authenticated: true,
    member: {
      name: session.member.name,
      email: session.member.email,
      phone: session.member.phone,
      joinedAt: session.member.createdAt.toISOString(),
      emailVerified: Boolean(session.member.emailVerifiedAt),
      loyaltyPoints: session.member.customer.loyaltyPoints,
      loyaltyTier: session.member.customer.loyaltyTier,
    },
    stats: {
      orderCount,
      couponCount,
    },
    orders: orders.map((order) => ({
      id: order.number,
      status: order.status,
      total: Number(order.total),
      items: order._count.items,
      createdAt: order.createdAt.toISOString(),
      recipient: session.member.name,
      payment: order.storefrontPayment ? {
        method: order.storefrontPayment.method,
        status: order.storefrontPayment.status,
        charged: Boolean(order.storefrontPayment.paidAt),
        refundedAmount: Number(order.storefrontPayment.refundedAmount),
        nextAction: order.storefrontPayment.status === "AWAITING_TRANSFER"
          ? "等待商家確認匯款"
          : order.storefrontPayment.status === "GATEWAY_REQUIRED"
            ? "尚未串接實際金流，本次未扣款"
            : "",
        bankTransfer: null,
      } : undefined,
    })),
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant, access } = await resolveStorefrontTenant(params.tenant);
  if (!access.allowed) throw new ApiError(403, access.reason || "此商城目前暫停會員服務");
  const session = await readStorefrontMemberSession(req, tenant.id);
  if (!session) throw new ApiError(401, "請先登入會員");
  const input = UpdateMemberInput.parse(await req.json());
  const email = input.email.toLowerCase();
  const emailChanged = email !== session.member.email;
  if (emailChanged) {
    if (!input.currentPassword || !await bcrypt.compare(input.currentPassword, session.member.passwordHash)) {
      throw new ApiError(401, "變更 Email 前請輸入目前密碼");
    }
    const duplicate = await prisma.storefrontMember.findFirst({
      where: { tenantId: tenant.id, email, id: { not: session.member.id } },
      select: { id: true },
    });
    if (duplicate) throw new ApiError(409, "此 Email 已由目前商城的其他會員使用");
  }
  await prisma.$transaction([
    prisma.storefrontMember.update({
      where: { id: session.member.id },
      data: {
        name: input.name,
        email,
        phone: input.phone,
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      },
    }),
    prisma.customer.update({
      where: { id: session.member.customerId },
      data: {
        companyName: input.name,
        contactName: input.name,
        email,
        phone: input.phone,
      },
    }),
  ]);
  return NextResponse.json({ ok: true, message: "會員資料已更新" });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }: { params: { tenant: string } }) => {
  const { tenant } = await resolveStorefrontTenant(params.tenant);
  const session = await readStorefrontMemberSession(req, tenant.id);
  if (!session) throw new ApiError(401, "請先登入會員");
  const input = DeleteMemberInput.parse(await req.json());
  if (!await bcrypt.compare(input.password, session.member.passwordHash)) {
    throw new ApiError(401, "密碼錯誤，未刪除會員");
  }
  await prisma.$transaction(async (tx) => {
    await tx.storefrontMember.delete({ where: { id: session.member.id } });
    await tx.customer.update({
      where: { id: session.member.customerId },
      data: {
        companyName: "已刪除會員",
        contactName: "已刪除會員",
        phone: null,
        email: null,
        address: null,
        isActive: false,
        remark: "官網會員已依本人要求刪除；歷史交易僅保留法定帳務關聯",
      },
    });
  });
  const response = NextResponse.json({
    ok: true,
    message: "會員帳號與登入資料已刪除；依法需保存的歷史交易僅保留匿名帳務關聯",
  });
  clearStorefrontMemberCookie(response, tenant.id);
  return response;
});
