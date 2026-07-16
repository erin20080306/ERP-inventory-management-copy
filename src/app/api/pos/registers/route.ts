import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const RegisterInput = z.object({
  id: z.string().optional(),
  warehouseId: z.string().min(1),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  isActive: z.boolean().default(true),
});

export const GET = apiHandler(async () => {
  const session = await requirePosPermission("view", "settings.view");
  const tenantId = await requireTenantId(session);
  const [registers, warehouses] = await Promise.all([
    prisma.posRegister.findMany({
      where: { tenantId },
      include: { warehouse: { select: { id: true, code: true, name: true, isActive: true } }, _count: { select: { shifts: true, sales: true } } },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    }),
    prisma.warehouse.findMany({ where: { tenantId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  return NextResponse.json({ registers, warehouses });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("edit", "settings.edit");
  const tenantId = await requireTenantId(session);
  const body = RegisterInput.parse(await req.json());
  const warehouse = await prisma.warehouse.findFirst({ where: { id: body.warehouseId, tenantId, isActive: true }, select: { id: true } });
  if (!warehouse) throw new ApiError(400, "找不到可用倉庫");
  const duplicate = await prisma.posRegister.findFirst({ where: { tenantId, code: body.code, ...(body.id ? { id: { not: body.id } } : {}) }, select: { id: true } });
  if (duplicate) throw new ApiError(409, `收銀台代碼 ${body.code} 已存在`);

  const register = body.id
    ? await prisma.posRegister.update({
        where: { id: body.id, tenantId },
        data: { warehouseId: body.warehouseId, code: body.code, name: body.name, isActive: body.isActive },
        include: { warehouse: true },
      })
    : await prisma.posRegister.create({
        data: { tenantId, warehouseId: body.warehouseId, code: body.code, name: body.name, isActive: body.isActive },
        include: { warehouse: true },
      });
  await audit({ userId: session.user.id, action: body.id ? "update_register" : "create_register", module: "pos", refId: register.id, detail: register.code });
  return NextResponse.json(register);
});
