import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { nextNumberFastInTransaction } from "@/lib/number-sequence";
import { prisma } from "@/lib/prisma";

const CustomerInput = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "customers.create");
  const tenantId = await requireTenantId(session);
  const body = CustomerInput.parse(await req.json());
  const customer = await prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findFirst({ where: { tenantId, phone: body.phone, isActive: true } });
    if (existing) throw new ApiError(409, "此電話已建立客戶，可直接選用");
    return tx.customer.create({
      data: {
        tenantId,
        code: await nextNumberFastInTransaction(tx, "MC", tenantId),
        companyName: body.name,
        phone: body.phone,
        email: body.email || null,
        isActive: true,
      },
    });
  });
  return NextResponse.json({ ok: true, customer });
});
