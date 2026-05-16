import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requireAuth, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限超級管理員");

  const tenants = await prisma.tenant.findMany({
    include: {
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const users = await prisma.user.findMany({
    include: { tenant: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      userCount: t._count.users,
    })),
    users,
    totalTenants: tenants.length,
    totalUsers: users.length,
  });
});
