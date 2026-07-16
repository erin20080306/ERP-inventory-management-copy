import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("purchases.view");
  const tenantId = await requireTenantId(session);
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  
  const where: any = q
    ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { supplier: { companyName: { contains: q, mode: "insensitive" } } }] }
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
    prisma.purchaseOrder.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        taxAmount: true,
        orderDate: true,
        supplier: { select: { companyName: true } },
        items: {
          select: {
            quantity: true,
            receivedQty: true,
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
    prisma.purchaseOrder.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("purchases.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { supplierId, items, remark, status, isTaxable } = body as any;
  if (!supplierId) throw new Error("請選擇供應商");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items, isTaxable !== false);
  const number = await nextNumber("PO", tenantId);
  const s = status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";

  // 使用 transaction 合併所有寫入，減少網路往返
  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.create({
      data: {
        tenantId,
        number,
        supplierId,
        remark,
        status: s,
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
      include: { items: true, supplier: true },
    });

    return order;
  });

  await audit({ userId: session.user.id, action: "create", module: "purchases", refId: created.id, detail: number });

  return NextResponse.json({ ...created, autoCreated: false });
});
