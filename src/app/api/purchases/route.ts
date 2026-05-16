import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("purchases.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q
    ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { supplier: { companyName: { contains: q, mode: "insensitive" } } }] }
    : { tenantId };
  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: { supplier: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("purchases.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { supplierId, items, remark, status } = body as any;
  if (!supplierId) throw new Error("請選擇供應商");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items);
  const number = await nextNumber("PO", tenantId);
  const created = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      number,
      supplierId,
      remark,
      status: status ?? "DRAFT",
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      items: {
        create: totals.computed.map((i: any) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount ?? 0,
          taxRate: i.taxRate ?? 0,
          subtotal: i.subtotal,
        })),
      },
    },
    include: { items: true, supplier: true },
  });
  await audit({ userId: session.user.id, action: "create", module: "purchases", refId: created.id, detail: number });
  return NextResponse.json(created);
});
