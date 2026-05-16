import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("hr.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const departmentId = sp.get("departmentId") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const tenantId = await requireTenantId();
  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { employeeNo: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { idNumber: { contains: q } },
    ];
  }
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;
  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: { department: true },
      orderBy: { employeeNo: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("hr.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  if (!body.employeeNo) throw new Error("請輸入員工編號");
  if (!body.name) throw new Error("請輸入姓名");
  if (!body.hireDate) throw new Error("請輸入到職日");
  const created = await prisma.employee.create({
    data: {
      tenantId,
      employeeNo: body.employeeNo,
      name: body.name,
      englishName: body.englishName,
      idNumber: body.idNumber || null,
      gender: body.gender || null,
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      phone: body.phone,
      email: body.email,
      address: body.address,
      emergencyContact: body.emergencyContact,
      emergencyPhone: body.emergencyPhone,
      departmentId: body.departmentId || null,
      position: body.position,
      hireDate: new Date(body.hireDate),
      resignDate: body.resignDate ? new Date(body.resignDate) : null,
      status: body.status || "ACTIVE",
      baseSalary: Number(body.baseSalary ?? 0),
      mealAllowance: Number(body.mealAllowance ?? 2400),
      transportAllowance: Number(body.transportAllowance ?? 0),
      positionAllowance: Number(body.positionAllowance ?? 0),
      insuredSalary: Number(body.insuredSalary ?? body.baseSalary ?? 0),
      laborPensionRate: Number(body.laborPensionRate ?? 0.06),
      voluntaryPensionRate: Number(body.voluntaryPensionRate ?? 0),
      dependents: Number(body.dependents ?? 0),
      bankName: body.bankName,
      bankAccountNo: body.bankAccountNo,
      taxId: body.taxId,
      remark: body.remark,
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "employees", refId: created.id });
  return NextResponse.json(created);
});
