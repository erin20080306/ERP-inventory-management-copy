import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const Input = z.object({ status: z.enum(["CONTACTED", "CLOSED"]) });

export const POST = apiHandler(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const { id } = await context.params;
  const body = Input.parse(await req.json());
  const result = await prisma.planInquiry.updateMany({
    where: { id, status: "NEW" },
    data: { status: body.status, contactedAt: new Date() },
  });
  if (!result.count) throw new ApiError(404, "找不到待處理的方案需求");
  return NextResponse.json({ ok: true });
});
