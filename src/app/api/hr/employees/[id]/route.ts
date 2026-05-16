import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("hr.view");
  const tenantId = await requireTenantId();
  const e = await prisma.employee.findUnique({
    where: { id: params.id, tenantId },
    include: { department: true, payrolls: { take: 12, orderBy: { createdAt: "desc" }, include: { period: true } } },
  });
  if (!e) throw new Error("找不到員工");
  return NextResponse.json(e);
});

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("hr.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const data: any = {};
  const fields = [
    "employeeNo", "name", "englishName", "idNumber", "gender", "phone", "email",
    "address", "emergencyContact", "emergencyPhone", "position", "status",
    "bankName", "bankAccountNo", "taxId", "remark",
  ];
  for (const f of fields) if (body[f] !== undefined) data[f] = body[f] || null;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
  if (body.birthDate !== undefined) data.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  if (body.hireDate !== undefined) data.hireDate = new Date(body.hireDate);
  if (body.resignDate !== undefined) data.resignDate = body.resignDate ? new Date(body.resignDate) : null;
  const numFields = ["baseSalary", "mealAllowance", "transportAllowance", "positionAllowance", "insuredSalary", "laborPensionRate", "voluntaryPensionRate", "dependents"];
  for (const f of numFields) if (body[f] !== undefined) data[f] = Number(body[f]);
  const updated = await prisma.employee.update({ where: { id: params.id, tenantId }, data });
  await audit({ userId: session.user.id, action: "update", module: "employees", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("hr.delete");
  const tenantId = await requireTenantId();
  await prisma.employee.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "employees", refId: params.id });
  return NextResponse.json({ ok: true });
});
