import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.view");
  const sp = req.nextUrl.searchParams;
  const employeeId = sp.get("employeeId");
  const year = sp.get("year");
  const tenantId = await requireTenantId();
  
  if (!employeeId) {
    throw new Error("缺少員工 ID");
  }

  // 獲取員工的薪資異動歷史
  const salaryChanges = await prisma.salaryChange.findMany({
    where: {
      tenantId,
      employeeId,
      ...(year ? { effectiveDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } } : {}),
    },
    include: { employee: { include: { department: true } } },
    orderBy: { effectiveDate: "desc" },
  });

  // 獲取員工的薪資單歷史
  const payrolls = await prisma.payroll.findMany({
    where: {
      employeeId,
      period: { tenantId },
      ...(year ? { period: { year: Number(year) } } : {}),
    },
    include: { period: true, items: true },
    orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }],
  });

  // 獲取員工的薪資結構歷史
  const salaryStructures = await prisma.employeeSalaryStructure.findMany({
    where: { employeeId },
    include: { structure: true },
    orderBy: { effectiveDate: "desc" },
  });

  return NextResponse.json({
    salaryChanges,
    payrolls,
    salaryStructures,
  });
});
