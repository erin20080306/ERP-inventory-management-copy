import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ensureTenantCompanyCode } from "@/lib/license";
import { seedTenantDefaults } from "@/lib/seed-tenant";

const Input = z.object({ tenantId: z.string().min(1), businessMode: z.enum(["ERP", "POS_RETAIL", "POS_RESTAURANT", "ECOMMERCE"]) });

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");
  const body = Input.parse(await req.json());
  const current = await prisma.tenant.findUnique({ where: { id: body.tenantId }, select: { businessMode: true } });
  if (!current) throw new ApiError(404, "找不到租戶");
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
  if (current.businessMode !== body.businessMode) await seedTenantDefaults(body.tenantId);
  const companyCode = body.businessMode === "ECOMMERCE" ? await ensureTenantCompanyCode(body.tenantId) : null;
  return NextResponse.json({ ok: true, companyCode });
});
