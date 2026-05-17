import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("customers.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q
    ? { tenantId, OR: [{ code: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }, { taxId: { contains: q } }, { phone: { contains: q } }] }
    : { tenantId };
  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.customer.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("customers.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const upsert = req.nextUrl.searchParams.get("upsert") === "1";
  if (upsert && body.code) {
    const result = await prisma.customer.upsert({
      where: { tenantId_code: { tenantId, code: body.code } },
      update: { ...body },
      create: { ...body, tenantId },
    });
    await audit({ userId: session.user.id, action: "upsert", module: "customers", refId: result.id });
    return NextResponse.json(result);
  }
  const created = await prisma.customer.create({ data: { ...body, tenantId } });
  await audit({ userId: session.user.id, action: "create", module: "customers", refId: created.id });
  return NextResponse.json(created);
});
