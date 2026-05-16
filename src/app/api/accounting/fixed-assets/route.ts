import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("assets.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const tenantId = await requireTenantId();
  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { serialNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  const [items, total] = await Promise.all([
    prisma.fixedAsset.findMany({ where, orderBy: { acquireDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.fixedAsset.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("assets.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  if (!body.code) throw new Error("請輸入資產編號");
  if (!body.name) throw new Error("請輸入資產名稱");
  if (!body.acquireCost || Number(body.acquireCost) <= 0) throw new Error("取得成本必須大於 0");

  const cost = Number(body.acquireCost);
  const residual = Number(body.residualValue ?? 0);

  const created = await prisma.fixedAsset.create({
    data: {
      tenantId,
      code: body.code,
      name: body.name,
      category: body.category,
      accountCode: body.accountCode,
      acquireDate: body.acquireDate ? new Date(body.acquireDate) : new Date(),
      acquireCost: cost,
      residualValue: residual,
      usefulLifeMonths: Number(body.usefulLifeMonths ?? 60),
      method: body.method ?? "STRAIGHT_LINE",
      accumulatedDepreciation: 0,
      bookValue: cost,
      location: body.location,
      serialNumber: body.serialNumber,
      supplierId: body.supplierId || null,
      status: body.status ?? "IN_USE",
      remark: body.remark,
      sourceJournalId: body.sourceJournalId || null,
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "fixed-assets", refId: created.id });
  return NextResponse.json(created);
});
