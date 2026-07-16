import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { activateTenantLicense } from "@/lib/license";

const Input = z.object({
  tenantId: z.string().min(1),
  planCode: z.enum(["TEAM_2", "TEAM_3", "TEAM_5", "SMALL_8"]),
  billing: z.enum(["MONTHLY", "ANNUAL", "ONCE"]),
  rotateKey: z.boolean().optional().default(false),
  expiresAt: z.string().datetime().optional().nullable(),
  payment: z.object({
    confirmation: z.literal("PAYMENT_RECEIVED"),
    paidAmount: z.number().positive().max(10_000_000),
    paidAt: z.string().datetime(),
    paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "OTHER"]),
    paymentReference: z.string().trim().min(3).max(100),
    notes: z.string().trim().max(500).optional().nullable(),
  }),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const body = Input.parse(await req.json());
  const result = await activateTenantLicense({
    tenantId: body.tenantId,
    planCode: body.planCode,
    billing: body.billing,
    actorUserId: session.user.id,
    rotateKey: body.rotateKey,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    payment: {
      paidAmount: body.payment.paidAmount,
      paidAt: new Date(body.payment.paidAt),
      paymentMethod: body.payment.paymentMethod,
      paymentReference: body.payment.paymentReference,
      notes: body.payment.notes,
    },
  });
  return NextResponse.json({
    ok: true,
    activationKey: result.activationKey,
    expiresAt: result.expiresAt,
    plan: result.plan,
    companyCode: result.companyCode,
    paymentId: result.paymentId,
    warning: result.activationKey ? "啟用碼只會顯示這一次，請安全交付客戶" : null,
  });
});
