import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const customers = await prisma.customer.findMany({
    where: {
      tenantId,
      isActive: true,
      code: { not: "POS-WALKIN" },
      ...(query ? {
        OR: [
          { code: { contains: query, mode: "insensitive" as const } },
          { companyName: { contains: query, mode: "insensitive" as const } },
          { phone: { contains: query } },
          { taxId: { contains: query } },
        ],
      } : {}),
    },
    select: { id: true, code: true, companyName: true, phone: true, taxId: true },
    orderBy: [{ companyName: "asc" }, { code: "asc" }],
    take: 80,
  });
  return NextResponse.json({ items: customers });
});
