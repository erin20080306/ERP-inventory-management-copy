import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requireAuth, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { seedTenantDefaults } from "@/lib/seed-tenant";

// 為所有現有租戶補建標準會計科目（僅限超級管理員）
export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  const results: { tenant: string; added: number }[] = [];

  for (const t of tenants) {
    const before = await prisma.chartOfAccount.count({ where: { tenantId: t.id } });
    await seedTenantDefaults(t.id);
    const after = await prisma.chartOfAccount.count({ where: { tenantId: t.id } });
    results.push({ tenant: t.name, added: after - before });
  }

  return NextResponse.json({ ok: true, results });
});
