import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { computePayroll } from "@/lib/payroll";

/**
 * POST /api/hr/payroll-periods/[id]/generate
 * 為該期間下所有在職員工自動產生薪資草稿
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("payroll.create");
  const tenantId = await requireTenantId();
  const period = await prisma.payrollPeriod.findUnique({ where: { id: params.id, tenantId } });
  if (!period) throw new Error("找不到結算期間");
  if (period.status !== "DRAFT") throw new Error("僅 DRAFT 狀態可產生薪資");

  const employees = await prisma.employee.findMany({
    where: { tenantId, status: { in: ["ACTIVE", "PROBATION"] } },
  });

  let created = 0;
  let skipped = 0;
  for (const emp of employees) {
    // 已存在則略過
    const exists = await prisma.payroll.findUnique({
      where: { periodId_employeeId: { periodId: period.id, employeeId: emp.id } },
    });
    if (exists) { skipped++; continue; }

    const calc = computePayroll({
      baseSalary: Number(emp.baseSalary),
      mealAllowance: Number(emp.mealAllowance),
      transportAllowance: Number(emp.transportAllowance),
      positionAllowance: Number(emp.positionAllowance),
      overtimePay: 0,
      bonus: 0,
      insuredSalary: Number(emp.insuredSalary || emp.baseSalary),
      dependents: emp.dependents,
      laborPensionRate: Number(emp.laborPensionRate),
      voluntaryPensionRate: Number(emp.voluntaryPensionRate),
    });

    const number = await nextNumber("PR", tenantId);
    await prisma.payroll.create({
      data: {
        number,
        periodId: period.id,
        employeeId: emp.id,
        earnings: calc.earnings,
        deductions: calc.deductions,
        employerCost: calc.employerCost,
        netPay: calc.netPay,
        status: "DRAFT",
        items: {
          create: calc.lines.map((l) => ({
            type: l.type,
            code: l.code,
            name: l.name,
            amount: l.amount,
            taxable: l.taxable ?? true,
          })),
        },
      },
    });
    created++;
  }

  await audit({
    userId: session.user.id,
    action: "generate_payroll",
    module: "payroll-periods",
    refId: period.id,
    detail: `created=${created} skipped=${skipped}`,
  });
  return NextResponse.json({ ok: true, created, skipped });
});
