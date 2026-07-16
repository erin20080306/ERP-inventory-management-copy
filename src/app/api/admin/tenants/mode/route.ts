import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const Input = z.object({ tenantId: z.string().min(1), businessMode: z.enum(["ERP", "POS_RETAIL", "POS_RESTAURANT"]) });

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const body = Input.parse(await req.json());
  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: body.tenantId }, data: { businessMode: body.businessMode } });
    if (body.businessMode === "POS_RESTAURANT") {
      const area = await tx.restaurantArea.upsert({ where: { tenantId_code: { tenantId: body.tenantId, code: "DINING" } }, update: { isActive: true }, create: { tenantId: body.tenantId, code: "DINING", name: "用餐區", sortOrder: 1 } });
      for (let index = 1; index <= 8; index += 1) {
        const code = `T${String(index).padStart(2, "0")}`;
        await tx.restaurantTable.upsert({ where: { tenantId_code: { tenantId: body.tenantId, code } }, update: { areaId: area.id, isActive: true }, create: { tenantId: body.tenantId, areaId: area.id, code, name: `${index} 號桌`, seats: index <= 2 ? 2 : 4, sortOrder: index } });
      }
    }
  });
  return NextResponse.json({ ok: true });
});
