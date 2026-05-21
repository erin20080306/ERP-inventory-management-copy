import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const year = sp.get("year");
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = year ? { tenantId, year: Number(year) } : { tenantId };
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  const items = await prisma.payrollPeriod.findMany({
    where,
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { _count: { select: { payrolls: true } } },
  });
  return NextResponse.json({ items, total: items.length });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("payroll.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const year = Number(body.year);
  const month = Number(body.month);
  if (!year || !month) throw new Error("請輸入年月");

  const lastDay = new Date(year, month, 0).getDate();
  const periodStart = new Date(`${year}-${String(month).padStart(2, "0")}-01`);
  const periodEnd = new Date(`${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);

  const created = await prisma.payrollPeriod.create({
    data: {
      tenantId,
      year,
      month,
      periodStart,
      periodEnd,
      payDate: body.payDate ? new Date(body.payDate) : null,
      status: "DRAFT",
      remark: body.remark,
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "payroll-periods", refId: created.id });
  return NextResponse.json(created);
});
