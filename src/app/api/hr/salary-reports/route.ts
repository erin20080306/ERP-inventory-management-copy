import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.view");
  const sp = req.nextUrl.searchParams;
  const year = sp.get("year");
  const month = sp.get("month");
  const departmentId = sp.get("departmentId");
  const reportType = sp.get("reportType") || "summary"; // summary / department / individual
  const tenantId = await requireTenantId();

  let where: any = { period: { tenantId } };
  if (year) where.period.year = Number(year);
  if (month) where.period.month = Number(month);

  if (reportType === "department") {
    // 部門薪資統計
    const payrolls = await prisma.payroll.findMany({
      where,
      include: { 
        employee: { include: { department: true } },
        period: true,
      },
      orderBy: { netPay: "desc" },
    });

    const departmentStats = new Map<string, { count: number; totalEarnings: number; totalDeductions: number; totalNetPay: number; totalEmployerCost: number }>();
    
    for (const payroll of payrolls) {
      const deptName = payroll.employee.department?.name || "未分類";
      const stats = departmentStats.get(deptName) || { count: 0, totalEarnings: 0, totalDeductions: 0, totalNetPay: 0, totalEmployerCost: 0 };
      stats.count += 1;
      stats.totalEarnings += Number(payroll.earnings);
      stats.totalDeductions += Number(payroll.deductions);
      stats.totalNetPay += Number(payroll.netPay);
      stats.totalEmployerCost += Number(payroll.employerCost);
      departmentStats.set(deptName, stats);
    }

    const result = Array.from(departmentStats.entries()).map(([department, stats]) => ({
      department,
      count: stats.count,
      totalEarnings: stats.totalEarnings,
      totalDeductions: stats.totalDeductions,
      totalNetPay: stats.totalNetPay,
      totalEmployerCost: stats.totalEmployerCost,
      avgEarnings: stats.count > 0 ? stats.totalEarnings / stats.count : 0,
      avgNetPay: stats.count > 0 ? stats.totalNetPay / stats.count : 0,
    }));

    return NextResponse.json({ type: "department", data: result });
  } else if (reportType === "individual") {
    // 個人薪資統計
    const payrolls = await prisma.payroll.findMany({
      where,
      include: { 
        employee: { include: { department: true } },
        period: true,
        items: true,
      },
      orderBy: { netPay: "desc" },
    });

    const result = payrolls.map((payroll) => ({
      employeeNo: payroll.employee.employeeNo,
      employeeName: payroll.employee.name,
      department: payroll.employee.department?.name || "未分類",
      position: payroll.employee.position,
      period: `${payroll.period.year}年${payroll.period.month}月`,
      earnings: Number(payroll.earnings),
      deductions: Number(payroll.deductions),
      employerCost: Number(payroll.employerCost),
      netPay: Number(payroll.netPay),
      workDays: Number(payroll.workDays),
      overtimeHours: Number(payroll.overtimeHours),
    }));

    return NextResponse.json({ type: "individual", data: result });
  } else {
    // 總體薪資統計
    const payrolls = await prisma.payroll.findMany({
      where,
      include: { period: true },
    });

    const totalEarnings = payrolls.reduce((sum, p) => sum + Number(p.earnings), 0);
    const totalDeductions = payrolls.reduce((sum, p) => sum + Number(p.deductions), 0);
    const totalNetPay = payrolls.reduce((sum, p) => sum + Number(p.netPay), 0);
    const totalEmployerCost = payrolls.reduce((sum, p) => sum + Number(p.employerCost), 0);
    const totalWorkDays = payrolls.reduce((sum, p) => sum + Number(p.workDays), 0);
    const totalOvertimeHours = payrolls.reduce((sum, p) => sum + Number(p.overtimeHours), 0);

    const result = {
      totalEmployees: payrolls.length,
      totalEarnings,
      totalDeductions,
      totalNetPay,
      totalEmployerCost,
      totalWorkDays,
      totalOvertimeHours,
      avgEarnings: payrolls.length > 0 ? totalEarnings / payrolls.length : 0,
      avgNetPay: payrolls.length > 0 ? totalNetPay / payrolls.length : 0,
    };

    return NextResponse.json({ type: "summary", data: result });
  }
});
