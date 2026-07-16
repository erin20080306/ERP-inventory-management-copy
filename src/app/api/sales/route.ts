import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("sales.view");
  const tenantId = await requireTenantId(session);
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  
  const where: any = q
    ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { companyName: { contains: q, mode: "insensitive" } } }] }
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
    prisma.salesOrder.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        taxAmount: true,
        orderDate: true,
        customer: { select: { companyName: true } },
        items: {
          select: {
            quantity: true,
            shippedQty: true,
            unitPrice: true,
            subtotal: true,
            discount: true,
            taxRate: true,
            product: {
              select: {
                sku: true,
                name: true,
                spec: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salesOrder.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("sales.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { customerId, items, remark, status, isTaxable } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items, isTaxable !== false);
  const number = await nextNumber("SO", tenantId);
  const initialStatus = status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";

  // 使用 transaction 合併所有寫入，減少網路往返
  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.create({
      data: {
        tenantId,
        number,
        customerId,
        remark,
        status: initialStatus,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        isTaxable: isTaxable !== false,
        updatedBy: currentUserId,
        items: {
          create: totals.computed.map((i: any) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount === "" ? 0 : (i.discount ?? 0),
            taxRate: i.taxRate === "" ? 0 : (i.taxRate ?? 0),
            subtotal: i.subtotal,
          })),
        },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    return order;
  });

  await audit({ userId: session.user.id, action: "create", module: "sales", refId: created.id, detail: number });

  return NextResponse.json({ ...created, autoCreated: false });
});
