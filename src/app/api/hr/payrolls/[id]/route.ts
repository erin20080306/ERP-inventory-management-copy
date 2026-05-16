import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { computePayroll } from "@/lib/payroll";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("payroll.view");
  const p = await prisma.payroll.findUnique({
    where: { id: params.id },
    include: { employee: { include: { department: true } }, period: true, items: true },
  });
  if (!p) throw new Error("找不到薪資單");
  return NextResponse.json(p);
});

/**
 * PATCH 動作：
 *  - action=recompute  根據 employee 設定重新計算
 *  - action=confirm    確認
 *  - action=pay        標記已發放
 *  - action=void       作廢
 *  - (no action) 更新 overtimePay / bonus / leaveDeduction / otherDeductions / remark 並重新計算
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("payroll.edit");
  const body = await req.json();
  const { action, ...patch } = body;

  const payroll = await prisma.payroll.findUnique({
    where: { id: params.id },
    include: { employee: true, items: true },
  });
  if (!payroll) throw new Error("找不到薪資單");

  let data: any = {};
  if (action === "confirm") data = { status: "CONFIRMED" };
  else if (action === "pay") data = { status: "PAID", paidAt: new Date() };
  else if (action === "void") data = { status: "VOID" };
  else {
    // 重新計算
    const overtimePay = Number(patch.overtimePay ?? findItemAmount(payroll.items, "OT"));
    const bonus = Number(patch.bonus ?? findItemAmount(payroll.items, "BONUS"));
    const leaveDeduction = Number(patch.leaveDeduction ?? findItemAmount(payroll.items, "LEAVE_DEDUCT"));
    const otherDeductions = Number(patch.otherDeductions ?? findItemAmount(payroll.items, "OTHER_DEDUCT"));

    const calc = computePayroll({
      baseSalary: Number(payroll.employee.baseSalary),
      mealAllowance: Number(payroll.employee.mealAllowance),
      transportAllowance: Number(payroll.employee.transportAllowance),
      positionAllowance: Number(payroll.employee.positionAllowance),
      overtimePay,
      bonus,
      insuredSalary: Number(payroll.employee.insuredSalary || payroll.employee.baseSalary),
      dependents: payroll.employee.dependents,
      laborPensionRate: Number(payroll.employee.laborPensionRate),
      voluntaryPensionRate: Number(payroll.employee.voluntaryPensionRate),
      leaveDeduction,
      otherDeductions,
    });

    // 重建明細
    await prisma.payrollItem.deleteMany({ where: { payrollId: params.id } });
    await prisma.payrollItem.createMany({
      data: calc.lines.map((l) => ({
        payrollId: params.id,
        type: l.type,
        code: l.code,
        name: l.name,
        amount: l.amount,
        taxable: l.taxable ?? true,
      })),
    });

    data = {
      workDays: patch.workDays != null ? Number(patch.workDays) : undefined,
      leaveDays: patch.leaveDays != null ? Number(patch.leaveDays) : undefined,
      overtimeHours: patch.overtimeHours != null ? Number(patch.overtimeHours) : undefined,
      earnings: calc.earnings,
      deductions: calc.deductions,
      employerCost: calc.employerCost,
      netPay: calc.netPay,
      remark: patch.remark,
    };
  }
  const updated = await prisma.payroll.update({
    where: { id: params.id },
    data,
    include: { items: true, employee: true, period: true },
  });
  await audit({ userId: session.user.id, action: action ?? "update", module: "payrolls", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("payroll.delete");
  await prisma.payroll.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "payrolls", refId: params.id });
  return NextResponse.json({ ok: true });
});

function findItemAmount(items: any[], code: string): number {
  const it = items.find((i) => i.code === code);
  return it ? Number(it.amount) : 0;
}
