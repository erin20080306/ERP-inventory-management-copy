import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";
import { autoCreateJournalFromOrder } from "@/lib/auto-journal";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("sales.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
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
      include: { customer: true, items: true },
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
  const isConfirmed = (status ?? "DRAFT") === "APPROVED";

  // 使用 transaction 合併所有寫入，減少網路往返
  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.create({
      data: {
        tenantId,
        number,
        customerId,
        remark,
        status: status ?? "DRAFT",
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

    if (isConfirmed) {
      await tx.accountsReceivable.create({
        data: { tenantId, customerId, salesOrderId: order.id, amount: totals.total, status: "DRAFT" },
      });
      // 確認時自動扣減庫存
      const defaultWh = await tx.warehouse.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: "asc" } });
      if (defaultWh) {
        for (const item of order.items) {
          const stock = await tx.inventoryStock.findUnique({
            where: { productId_warehouseId: { productId: item.productId, warehouseId: defaultWh.id } },
          });
          const newQty = Math.max(0, Number(stock?.quantity ?? 0) - Number(item.quantity));
          await tx.inventoryStock.upsert({
            where: { productId_warehouseId: { productId: item.productId, warehouseId: defaultWh.id } },
            update: { quantity: newQty },
            create: { tenantId, productId: item.productId, warehouseId: defaultWh.id, quantity: 0 },
          });
          await tx.inventoryTransaction.create({
            data: { tenantId, productId: item.productId, warehouseId: defaultWh.id, type: "SALES_OUT", quantity: Number(item.quantity) * -1, unitCost: item.unitPrice, refType: "SALES", refId: order.id, remark: `銷售確認出庫 ${order.number}` },
          });
        }
      }
    }

    return order;
  });

  // 非同步處理：audit + 自動傳票（不阻塞回應）
  const bgTasks: Promise<any>[] = [
    audit({ userId: session.user.id, action: "create", module: "sales", refId: created.id, detail: number }),
  ];
  if (isConfirmed) {
    bgTasks.push(
      autoCreateJournalFromOrder("sales", created, tenantId, session.user.id)
    );
  }
  await Promise.all(bgTasks);

  return NextResponse.json({ ...created, autoCreated: isConfirmed });
});
