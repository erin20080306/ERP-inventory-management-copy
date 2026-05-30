import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("customers.view");
  const tenantId = await requireTenantId(session);
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = q
    ? { tenantId, OR: [{ code: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }, { taxId: { contains: q } }, { phone: { contains: q } }] }
    : { tenantId };
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        code: true,
        companyName: true,
        taxId: true,
        phone: true,
        email: true,
        address: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("customers.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const upsert = req.nextUrl.searchParams.get("upsert") === "1";
  if (upsert && body.code) {
    const result = await prisma.customer.upsert({
      where: { tenantId_code: { tenantId, code: body.code } },
      update: { ...body, updatedBy: currentUserId },
      create: { ...body, tenantId, updatedBy: currentUserId },
    });
    await audit({ userId: session.user.id, action: "upsert", module: "customers", refId: result.id });
    return NextResponse.json(result);
  }
  const created = await prisma.customer.create({ data: { ...body, tenantId, updatedBy: currentUserId } });
  await audit({ userId: session.user.id, action: "create", module: "customers", refId: created.id });
  return NextResponse.json(created);
});
