import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("returns.view");
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
    prisma.salesReturn.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salesReturn.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("returns.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { customerId, salesOrderId, reason, status, items } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items);
  const number = await nextNumber("SR", tenantId);

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.salesReturn.create({
      data: {
        tenantId,
        number,
        customerId,
        salesOrderId,
        reason,
        status: status ?? "DRAFT",
        returnDate: new Date(),
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
      include: { items: true, customer: true },
    });

    // 如果確認，更新庫存和應收帳款
    if ((status ?? "DRAFT") === "CONFIRMED") {
      for (const item of ret.items) {
        // 更新庫存（退貨入庫）
        const stock = await tx.inventoryStock.findFirst({
          where: { productId: item.productId },
        });
        if (stock) {
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: { increment: Number(item.quantity) } },
          });
        }
        
        // 記錄庫存交易
        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: stock?.warehouseId || "",
            type: "SALES_RETURN_IN",
            quantity: Number(item.quantity),
            refType: "SALES_RETURN",
            refId: ret.id,
            remark: `銷貨退回 ${ret.number}`,
          },
        });
      }

      // 沖銷應收帳款（使用備註欄位標記退貨）
      await tx.accountsReceivable.create({
        data: {
          tenantId,
          customerId,
          salesOrderId: ret.id,
          amount: -totals.total,
          status: "OPEN",
        },
      });
    }

    return ret;
  });

  await audit({ userId: session.user.id, action: "create", module: "returns", refId: created.id, detail: number });

  return NextResponse.json(created);
});
