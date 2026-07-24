import { prisma } from "@/lib/prisma";
import { getLedgerCashBalance } from "@/lib/pos-daily-summary";

export type DashboardAccess = {
  sales: boolean;
  salesApprove: boolean;
  purchases: boolean;
  purchasesApprove: boolean;
  returns: boolean;
  returnsApprove: boolean;
  pos: boolean;
  posApprove: boolean;
  restaurant: boolean;
  journals: boolean;
  journalsApprove: boolean;
  cashApprove: boolean;
};

export type DashboardWorkItem = {
  id: string;
  kind: "APPROVAL" | "UNFINISHED";
  module: string;
  title: string;
  detail: string;
  status: string;
  href: string;
  updatedAt: Date;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待核准",
  APPROVED: "待執行",
  PARTIALLY_SHIPPED: "部分出貨",
  PARTIALLY_RECEIVED: "部分進貨",
  OPEN: "未結帳",
  SENT: "已送廚",
  PREPARING: "製作中",
  READY: "待出餐",
  HELD: "暫存",
  PENDING: "待核准",
};

function workStatus(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export async function getDashboardWorkItems(
  tenantId: string,
  access: DashboardAccess,
  options: { webOnly?: boolean } = {},
) {
  const groups = await Promise.all([
    access.sales
      ? prisma.salesOrder.findMany({
          where: {
            tenantId,
            ...(options.webOnly ? { remark: { startsWith: "[WEB]" } } : {}),
            status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_SHIPPED"] },
          },
          select: { id: true, number: true, status: true, total: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 6,
        }).then((orders) => orders.map((order): DashboardWorkItem => ({
          id: `sales-${order.id}`,
          kind: order.status === "SUBMITTED" && access.salesApprove ? "APPROVAL" : "UNFINISHED",
          module: options.webOnly ? "網路訂單" : "銷售",
          title: `${order.number} · ${workStatus(order.status)}`,
          detail: `訂單金額 NT$ ${Number(order.total).toLocaleString("zh-TW")}`,
          status: workStatus(order.status),
          href: "/sales",
          updatedAt: order.updatedAt,
        })))
      : Promise.resolve([] as DashboardWorkItem[]),
    access.purchases
      ? prisma.purchaseOrder.findMany({
          where: { tenantId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED"] } },
          select: { id: true, number: true, status: true, total: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 5,
        }).then((orders) => orders.map((order): DashboardWorkItem => ({
          id: `purchase-${order.id}`,
          kind: order.status === "SUBMITTED" && access.purchasesApprove ? "APPROVAL" : "UNFINISHED",
          module: "採購",
          title: `${order.number} · ${workStatus(order.status)}`,
          detail: `採購金額 NT$ ${Number(order.total).toLocaleString("zh-TW")}`,
          status: workStatus(order.status),
          href: "/purchases",
          updatedAt: order.updatedAt,
        })))
      : Promise.resolve([] as DashboardWorkItem[]),
    access.returns
      ? Promise.all([
          prisma.salesReturn.findMany({
            where: { tenantId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
            select: { id: true, number: true, status: true, total: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
            take: 4,
          }),
          prisma.purchaseReturn.findMany({
            where: { tenantId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
            select: { id: true, number: true, status: true, total: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
            take: 4,
          }),
        ]).then(([salesReturns, purchaseReturns]) => [
          ...salesReturns.map((item): DashboardWorkItem => ({
            id: `sales-return-${item.id}`,
            kind: item.status === "SUBMITTED" && access.returnsApprove ? "APPROVAL" : "UNFINISHED",
            module: "銷售退貨",
            title: `${item.number} · ${workStatus(item.status)}`,
            detail: `退款／退貨金額 NT$ ${Number(item.total).toLocaleString("zh-TW")}`,
            status: workStatus(item.status),
            href: "/returns",
            updatedAt: item.updatedAt,
          })),
          ...purchaseReturns.map((item): DashboardWorkItem => ({
            id: `purchase-return-${item.id}`,
            kind: item.status === "SUBMITTED" && access.returnsApprove ? "APPROVAL" : "UNFINISHED",
            module: "採購退貨",
            title: `${item.number} · ${workStatus(item.status)}`,
            detail: `退貨金額 NT$ ${Number(item.total).toLocaleString("zh-TW")}`,
            status: workStatus(item.status),
            href: "/returns",
            updatedAt: item.updatedAt,
          })),
        ])
      : Promise.resolve([] as DashboardWorkItem[]),
    access.restaurant
      ? prisma.restaurantOrder.findMany({
          where: { tenantId, status: { in: ["OPEN", "SENT", "PREPARING", "READY"] } },
          select: {
            id: true,
            number: true,
            status: true,
            updatedAt: true,
            table: { select: { name: true } },
            _count: { select: { items: true } },
          },
          orderBy: { updatedAt: "asc" },
          take: 6,
        }).then((orders) => orders.map((order): DashboardWorkItem => ({
          id: `restaurant-${order.id}`,
          kind: "UNFINISHED",
          module: "餐飲 POS",
          title: `${order.table.name} · ${workStatus(order.status)}`,
          detail: `${order.number}，共 ${order._count.items} 項餐點`,
          status: workStatus(order.status),
          href: order.status === "OPEN" ? "/pos/restaurant" : "/pos/restaurant/kitchen",
          updatedAt: order.updatedAt,
        })))
      : Promise.resolve([] as DashboardWorkItem[]),
    access.pos
      ? prisma.posHeldSale.findMany({
          where: { tenantId, status: "HELD" },
          select: { id: true, label: true, status: true, updatedAt: true },
          orderBy: { updatedAt: "asc" },
          take: 4,
        }).then((sales) => sales.map((sale): DashboardWorkItem => ({
          id: `held-${sale.id}`,
          kind: "UNFINISHED",
          module: "一般 POS",
          title: `${sale.label} · 暫存交易`,
          detail: "尚未恢復結帳",
          status: workStatus(sale.status),
          href: "/pos",
          updatedAt: sale.updatedAt,
        })))
      : Promise.resolve([] as DashboardWorkItem[]),
    access.pos && access.posApprove && access.salesApprove
      ? prisma.posManagerApproval.findMany({
          where: { tenantId, kind: "MANUAL_DISCOUNT", status: "PENDING", expiresAt: { gte: new Date() } },
          select: { id: true, reason: true, status: true, createdAt: true, expiresAt: true },
          orderBy: { createdAt: "asc" },
          take: 5,
        }).then((approvals) => approvals.map((approval): DashboardWorkItem => ({
          id: `discount-approval-${approval.id}`,
          kind: "APPROVAL",
          module: "POS 折扣",
          title: approval.reason || "手動折扣申請",
          detail: `須於 ${approval.expiresAt.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 前處理`,
          status: workStatus(approval.status),
          href: "/pos/offers",
          updatedAt: approval.createdAt,
        })))
      : Promise.resolve([] as DashboardWorkItem[]),
    access.pos && access.posApprove && access.cashApprove
      ? prisma.posCashMovement.findMany({
          where: { tenantId, status: "PENDING", shift: { status: "OPEN" } },
          select: {
            id: true,
            type: true,
            amount: true,
            reason: true,
            status: true,
            requestedAt: true,
            register: { select: { name: true } },
          },
          orderBy: { requestedAt: "asc" },
          take: 5,
        }).then((movements) => movements.map((movement): DashboardWorkItem => ({
          id: `cash-approval-${movement.id}`,
          kind: "APPROVAL",
          module: "錢櫃",
          title: `${movement.register.name} · ${movement.type === "PAID_IN" ? "投入" : movement.type === "PAID_OUT" ? "提出" : "繳庫"}`,
          detail: `NT$ ${Number(movement.amount).toLocaleString("zh-TW")}，${movement.reason}`,
          status: workStatus(movement.status),
          href: "/pos",
          updatedAt: movement.requestedAt,
        })))
      : Promise.resolve([] as DashboardWorkItem[]),
    access.journals
      ? prisma.journalEntry.findMany({
          where: { tenantId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
          select: { id: true, number: true, summary: true, status: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 5,
        }).then((entries) => entries.map((entry): DashboardWorkItem => ({
          id: `journal-${entry.id}`,
          kind: entry.status === "SUBMITTED" && access.journalsApprove ? "APPROVAL" : "UNFINISHED",
          module: "會計傳票",
          title: `${entry.number} · ${workStatus(entry.status)}`,
          detail: entry.summary,
          status: workStatus(entry.status),
          href: "/accounting/journals",
          updatedAt: entry.updatedAt,
        })))
      : Promise.resolve([] as DashboardWorkItem[]),
  ]);

  const items = groups.flat().sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "APPROVAL" ? -1 : 1;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
  return {
    items: items.slice(0, 18),
    approvalCount: items.filter((item) => item.kind === "APPROVAL").length,
    unfinishedCount: items.filter((item) => item.kind === "UNFINISHED").length,
  };
}

export async function getDashboardKpis(tenantId: string, options: { webOnly?: boolean } = {}) {
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const startToday = new Date(Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), taipei.getUTCDate()) - 8 * 60 * 60 * 1000);
  const endToday = new Date(startToday.getTime() + 24 * 60 * 60 * 1000);
  const startMonth = new Date(Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), 1) - 8 * 60 * 60 * 1000);
  const channelWhere = options.webOnly ? { remark: { startsWith: "[WEB]" } } : {};

  const [
    todaySales,
    todayOrders,
    todayItems,
    monthSales,
    monthPurchase,
    arOpen,
    apOpen,
    inventoryValue,
    inventoryCash,
    lowStockCount,
    unshipped,
    unpaidPO,
  ] = await Promise.all([
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, ...channelWhere, orderDate: { gte: startToday, lt: endToday }, status: { not: "VOIDED" } },
    }),
    prisma.salesOrder.count({
      where: { tenantId, ...channelWhere, orderDate: { gte: startToday, lt: endToday }, status: { not: "VOIDED" } },
    }),
    prisma.salesOrderItem.aggregate({
      _sum: { quantity: true },
      where: { order: { tenantId, ...channelWhere, orderDate: { gte: startToday, lt: endToday }, status: { not: "VOIDED" } } },
    }),
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, ...channelWhere, orderDate: { gte: startMonth }, status: { not: "VOIDED" } },
    }),
    prisma.purchaseOrder.aggregate({
      _sum: { total: true },
      where: { tenantId, orderDate: { gte: startMonth }, status: { not: "VOIDED" } },
    }),
    prisma.accountsReceivable.aggregate({ _sum: { amount: true, paidAmount: true }, where: { tenantId, status: { in: ["POSTED", "PARTIAL"] } } }),
    prisma.accountsPayable.aggregate({ _sum: { amount: true, paidAmount: true }, where: { tenantId, status: { in: ["POSTED", "PARTIAL"] } } }),
    (prisma.$queryRawUnsafe as any)(
      `SELECT COALESCE(SUM(s.quantity * p."costPrice"),0) as total FROM "InventoryStock" s JOIN "Product" p ON p.id = s."productId" WHERE s."tenantId" = $1`,
      tenantId
    ) as Promise<{ total: any }[]>,
    getLedgerCashBalance(tenantId),
    (prisma.$queryRawUnsafe as any)(
      `SELECT COUNT(*) as count
       FROM "Product" p
       WHERE p."tenantId" = $1
         AND p."isActive" = true
         AND COALESCE((SELECT SUM(s.quantity) FROM "InventoryStock" s WHERE s."productId" = p.id), 0) < p."safetyStock"`,
      tenantId
    ) as Promise<{ count: any }[]>,
    prisma.salesOrder.count({ where: { tenantId, ...channelWhere, status: { in: ["DRAFT", "SUBMITTED"] } } }),
    prisma.purchaseOrder.count({ where: { tenantId, status: { in: ["SUBMITTED", "APPROVED"] } } }),
  ]);

  return {
    todaySales: Number(todaySales._sum.total ?? 0),
    todayOrders,
    todayQuantity: Number(todayItems._sum.quantity ?? 0),
    monthSales: Number(monthSales._sum.total ?? 0),
    monthPurchase: Number(monthPurchase._sum.total ?? 0),
    arTotal: Number(arOpen._sum.amount ?? 0) - Number(arOpen._sum.paidAmount ?? 0),
    apTotal: Number(apOpen._sum.amount ?? 0) - Number(apOpen._sum.paidAmount ?? 0),
    inventoryValue: Number(inventoryValue[0]?.total ?? 0),
    inventoryCash,
    lowStockCount: Number(lowStockCount[0]?.count ?? 0),
    unshipped,
    unpaidPO,
  };
}

export async function getDashboardVisualStats(
  tenantId: string,
  access: { sales: boolean; purchases: boolean; inventory: boolean } = { sales: true, purchases: true, inventory: true },
) {
  const [lowStock, recentSales, topProducts, salesByStatus, inventoryByWarehouse] = await Promise.all([
    access.inventory
      ? prisma.product.findMany({
          where: { tenantId, isActive: true },
          include: { stocks: true },
          take: 100,
        })
      : Promise.resolve([]),
    access.sales
      ? prisma.salesOrder.findMany({
          where: { tenantId },
          take: 8,
          orderBy: { createdAt: "desc" },
          include: { customer: true },
        })
      : Promise.resolve([]),
    access.sales
      ? prisma.$queryRawUnsafe<any[]>(
          `SELECT i."productId", SUM(i.subtotal) as subtotal, SUM(i.quantity) as qty
           FROM "SalesOrderItem" i
           JOIN "SalesOrder" o ON o.id = i."orderId"
           WHERE o."tenantId" = $1
           GROUP BY i."productId" ORDER BY subtotal DESC LIMIT 5`,
          tenantId,
        )
      : Promise.resolve([]),
    access.sales
      ? prisma.salesOrder.groupBy({
          by: ["status"],
          _count: { id: true },
          where: { tenantId },
        })
      : Promise.resolve([]),
    access.inventory
      ? prisma.$queryRawUnsafe<Array<{ name: string; total: unknown }>>(
          `SELECT w.name, COALESCE(SUM(s.quantity),0) as total FROM "InventoryStock" s JOIN "Warehouse" w ON w.id = s."warehouseId" WHERE s."tenantId" = $1 GROUP BY w.name`,
          tenantId,
        )
      : Promise.resolve([]),
  ]);

  const lowStockList = lowStock
    .map((product: any) => ({
      ...product,
      total: product.stocks.reduce((sum: number, stock: any) => sum + Number(stock.quantity), 0),
    }))
    .filter((product: any) => product.total < Number(product.safetyStock))
    .slice(0, 8);

  const productMap = topProducts.length
    ? await prisma.product.findMany({ where: { id: { in: topProducts.map((item: any) => item.productId) } } })
    : [];

  const start14 = new Date();
  start14.setDate(start14.getDate() - 13);
  start14.setHours(0, 0, 0, 0);
  const [dailySales, dailyPurchase] = await Promise.all([
    access.sales
      ? prisma.$queryRawUnsafe<Array<{ d: string; total: unknown }>>(
          `SELECT to_char("orderDate"::date, 'YYYY-MM-DD') as d, COALESCE(SUM(total),0) as total
           FROM "SalesOrder" WHERE "tenantId" = $1 AND "orderDate" >= $2 AND status <> 'VOIDED'
           GROUP BY 1 ORDER BY 1`,
          tenantId,
          start14,
        )
      : Promise.resolve([]),
    access.purchases
      ? prisma.$queryRawUnsafe<Array<{ d: string; total: unknown }>>(
          `SELECT to_char("orderDate"::date, 'YYYY-MM-DD') as d, COALESCE(SUM(total),0) as total
           FROM "PurchaseOrder" WHERE "tenantId" = $1 AND "orderDate" >= $2 AND status <> 'VOIDED'
           GROUP BY 1 ORDER BY 1`,
          tenantId,
          start14,
        )
      : Promise.resolve([]),
  ]);

  const trendMap: Record<string, { date: string; sales: number; purchase: number }> = {};
  for (let index = 0; index < 14; index++) {
    const date = new Date(start14);
    date.setDate(start14.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    trendMap[key] = { date: key.slice(5), sales: 0, purchase: 0 };
  }
  dailySales.forEach((row) => {
    if (trendMap[row.d]) trendMap[row.d].sales = Number(row.total);
  });
  dailyPurchase.forEach((row) => {
    if (trendMap[row.d]) trendMap[row.d].purchase = Number(row.total);
  });

  return {
    lowStockList,
    recentSales,
    topProducts: topProducts.map((item: any) => ({
      name: productMap.find((product) => product.id === item.productId)?.name ?? "-",
      subtotal: Number(item.subtotal ?? item._sum?.subtotal ?? 0),
      qty: Number(item.qty ?? item._sum?.quantity ?? 0),
    })),
    trend: Object.values(trendMap),
    salesByStatus: salesByStatus.map((status: any) => ({
      name: status.status === "DRAFT" ? "草稿" : status.status === "SUBMITTED" ? "已送審" : status.status === "APPROVED" ? "已審核" : status.status === "POSTED" ? "已過帳" : status.status === "VOIDED" ? "已作廢" : status.status,
      value: status._count.id,
    })),
    inventoryByWarehouse: inventoryByWarehouse.map((warehouse) => ({
      name: warehouse.name,
      value: Number(warehouse.total),
    })),
  };
}
