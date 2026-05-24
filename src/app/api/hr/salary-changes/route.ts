import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const type = sp.get("type") ?? "";
  const status = sp.get("status") ?? "";
  const employeeId = sp.get("employeeId") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 50);
  const tenantId = await requireTenantId();
  const where: any = { tenantId };
  if (q) where.OR = [
    { number: { contains: q, mode: "insensitive" } },
    { employee: { name: { contains: q, mode: "insensitive" } } },
    { employee: { employeeNo: { contains: q, mode: "insensitive" } } },
  ];
  if (type) where.type = type;
  if (status) where.status = status;
  if (employeeId) where.employeeId = employeeId;
  const [items, total] = await Promise.all([
    prisma.salaryChange.findMany({
      where,
      include: { employee: { include: { department: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salaryChange.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const change = await prisma.salaryChange.create({
    data: {
      tenantId,
      number: body.number,
      employeeId: body.employeeId,
      type: body.type,
      status: body.status || "DRAFT",
      effectiveDate: new Date(body.effectiveDate),
      oldDepartmentId: body.oldDepartmentId,
      oldPosition: body.oldPosition,
      oldBaseSalary: body.oldBaseSalary,
      oldTotalSalary: body.oldTotalSalary,
      newDepartmentId: body.newDepartmentId,
      newPosition: body.newPosition,
      newBaseSalary: body.newBaseSalary,
      newTotalSalary: body.newTotalSalary,
      reason: body.reason,
      remark: body.remark,
    },
    include: { employee: { include: { department: true } } },
  });
  return NextResponse.json(change);
});
