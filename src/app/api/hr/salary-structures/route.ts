import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const type = sp.get("type") ?? "";
  const isActive = sp.get("isActive");
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 50);
  const tenantId = await requireTenantId();
  const where: any = { tenantId };
  if (q) where.OR = [
    { code: { contains: q, mode: "insensitive" } },
    { name: { contains: q, mode: "insensitive" } },
  ];
  if (type) where.type = type;
  if (isActive !== null) where.isActive = isActive === "true";
  const [items, total] = await Promise.all([
    prisma.salaryStructure.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salaryStructure.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const structure = await prisma.salaryStructure.create({
    data: {
      tenantId,
      code: body.code,
      name: body.name,
      type: body.type,
      calculationMethod: body.calculationMethod,
      amount: body.amount || 0,
      rate: body.rate,
      isTaxable: body.isTaxable ?? true,
      isInsuranceBase: body.isInsuranceBase ?? true,
      isPensionBase: body.isPensionBase ?? true,
      description: body.description,
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json(structure);
});
