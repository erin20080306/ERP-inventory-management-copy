import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserName } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";
import { auditDocumentTotalsDecimal } from "@/lib/money-audit";
import { syncCentralStorefrontOrders } from "@/lib/storefront-order-sync";
import { backfillLocalStorefrontOrderStatuses } from "@/lib/storefront-order-status-backfill";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("sales.view");
  const tenantId = await requireTenantId(session);
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const channel = sp.get("channel") ?? "";
  if (channel === "WEB" && process.env.LOCAL_LICENSE_MODE === "true") {
    try {
      await syncCentralStorefrontOrders(tenantId);
      await backfillLocalStorefrontOrderStatuses(tenantId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(`無法同步中央商城訂單：${message}`);
    }
  }
  const allowedStatuses = new Set(["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_SHIPPED", "POSTED", "VOIDED", "REJECTED"]);
  const statuses = (sp.get("status") ?? "")
    .split(",")
    .map((status) => status.trim().toUpperCase())
    .filter((status) => allowedStatuses.has(status));

  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (channel === "WEB") where.remark = { startsWith: "[WEB]" };
  if (statuses.length) where.status = { in: statuses };
  
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  
  const [items, total, channelSummary] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        taxAmount: true,
        orderDate: true,
        remark: true,
        customer: { select: { companyName: true } },
        storefrontPayment: { select: { method: true, status: true } },
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
    channel === "WEB"
      ? prisma.salesOrder.groupBy({
          by: ["status"],
          where: { tenantId, remark: { startsWith: "[WEB]" } },
          _count: { _all: true },
        })
      : [],
  ]);
  return NextResponse.json({
    items,
    total,
    summary: Object.fromEntries(channelSummary.map((row) => [row.status, row._count._all])),
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("sales.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserName();
  const body = await req.json();
  const { customerId, items, remark, status, isTaxable } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const taxable = isTaxable !== false;
  const totals = calcTotals(items, taxable);
  auditDocumentTotalsDecimal("sales.create", items, taxable, totals, {
    tenantId,
    itemCount: items.length,
  });
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
        isTaxable: taxable,
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
