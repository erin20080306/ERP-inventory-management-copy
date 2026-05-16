import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const periodId = sp.get("periodId") ?? "";
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 50);
  const tenantId = await requireTenantId();
  const where: any = { tenantId };
  if (q) where.OR = [
    { number: { contains: q, mode: "insensitive" } },
    { employee: { name: { contains: q, mode: "insensitive" } } },
    { employee: { employeeNo: { contains: q, mode: "insensitive" } } },
  ];
  if (periodId) where.periodId = periodId;
  if (status) where.status = status;
  const [items, total] = await Promise.all([
    prisma.payroll.findMany({
      where,
      include: { employee: { include: { department: true } }, period: true, items: true },
      orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }, { number: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payroll.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});
