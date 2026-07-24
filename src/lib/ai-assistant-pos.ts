import type { ReportResult } from "@/lib/ai-assistant";
import { prisma } from "@/lib/prisma";
import { getLedgerCashBalance, getPosShiftCashPosition, taipeiDayRange } from "@/lib/pos-daily-summary";

type Period = { from: Date; to: Date; label: string };

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "現金",
  CARD: "信用卡",
  MOBILE: "行動支付",
  TRANSFER: "轉帳",
};

const RESTAURANT_STATUS_LABELS: Record<string, string> = {
  OPEN: "已開桌",
  SENT: "已送廚",
  PREPARING: "製作中",
  READY: "待上菜",
  COMPLETED: "已結帳",
  CANCELLED: "已取消",
};

const MOVEMENT_LABELS: Record<string, string> = {
  PAID_IN: "投入現金",
  PAID_OUT: "提出現金",
  SAFE_DROP: "營業中抽離／入庫",
};

const MOVEMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待主管核准",
  APPROVED: "已核准",
  REJECTED: "已拒絕",
  CANCELLED: "已取消",
};

function money(value: number) {
  return `NT$ ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function decimal(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtDuration(from: Date | string | null | undefined, to: Date | string | null | undefined) {
  if (!from || !to) return "—";
  const seconds = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}

function fmtDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Taipei",
  });
}

function taipeiParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
  };
}

function taipeiStart(year: number, month: number, date: number) {
  return new Date(Date.UTC(year, month, date) - 8 * 60 * 60 * 1000);
}

export function parsePosAssistantPeriod(question: string, now = new Date()): Period {
  const today = taipeiDayRange(now);
  if (/昨天|昨日/.test(question)) {
    return {
      from: new Date(today.start.getTime() - 86400000),
      to: new Date(today.start.getTime() - 1),
      label: "昨日",
    };
  }
  if (/今天|今日|當日|現在|目前/.test(question)) {
    return { from: today.start, to: new Date(today.end.getTime() - 1), label: "今日" };
  }
  const parts = taipeiParts(now);
  if (/本週|這週|本周|這周/.test(question)) {
    const daysFromMonday = (parts.day + 6) % 7;
    const from = taipeiStart(parts.year, parts.month, parts.date - daysFromMonday);
    return { from, to: new Date(today.end.getTime() - 1), label: "本週" };
  }
  if (/近\s*7\s*天|最近\s*7\s*天/.test(question)) {
    return { from: new Date(today.start.getTime() - 6 * 86400000), to: new Date(today.end.getTime() - 1), label: "近 7 天" };
  }
  if (/近\s*30\s*天|最近\s*30\s*天/.test(question)) {
    return { from: new Date(today.start.getTime() - 29 * 86400000), to: new Date(today.end.getTime() - 1), label: "近 30 天" };
  }
  if (/上月|上個月/.test(question)) {
    const from = taipeiStart(parts.year, parts.month - 1, 1);
    const to = new Date(taipeiStart(parts.year, parts.month, 1).getTime() - 1);
    return { from, to, label: "上月" };
  }
  if (/今年|本年/.test(question)) {
    return {
      from: taipeiStart(parts.year, 0, 1),
      to: new Date(today.end.getTime() - 1),
      label: `${parts.year} 年`,
    };
  }
  return {
    from: taipeiStart(parts.year, parts.month, 1),
    to: new Date(today.end.getTime() - 1),
    label: "本月",
  };
}

export function isPosAssistantQuestion(question: string) {
  const text = String(question ?? "");
  return /(?:\bpos\b|收銀|收銀台|班次|開班|結班|開店人員|開班人員|結班人員|錢櫃|備用金|零用金|庫存現金|應有現金|現金短溢|現金差額|投入現金|提出現金|抽離入庫|付款方式|刷卡|客單價|餐飲|餐點|桌位|桌均|開桌|出餐|送廚|待上菜|廚房|用餐人數|未結帳桌位|今日.*營業額|本月.*營業額|客戶.*營業額|客戶.*消費|會員.*消費|回購次數|商品.*訂單|商品.*販售|商品.*銷售數量|熱賣商品|熱賣餐點|滯銷商品|退款最多商品|現在誰.*班)/i.test(text);
}

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

async function findNamedCustomer(tenantId: string, question: string) {
  if (!/客戶|會員|消費|回購/.test(question)) return null;
  const normalized = compact(question);
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true, code: true, companyName: true },
  });
  return customers
    .filter((customer) => normalized.includes(compact(customer.companyName)) || normalized.includes(compact(customer.code)))
    .sort((a, b) => b.companyName.length - a.companyName.length)[0] ?? null;
}

async function findNamedProduct(tenantId: string, question: string) {
  if (!/商品|產品|貨品|品項|餐點|菜色/.test(question)) return null;
  const normalized = compact(question);
  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, sku: true, name: true },
  });
  return products
    .filter((product) => normalized.includes(compact(product.name)) || normalized.includes(compact(product.sku)))
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

export async function buildPosOperationsReport(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePosAssistantPeriod(question);
  const [matchedCustomer, matchedProduct] = await Promise.all([
    findNamedCustomer(tenantId, question),
    findNamedProduct(tenantId, question),
  ]);
  const saleWhere: any = {
    tenantId,
    status: { not: "VOIDED" },
    createdAt: { gte: period.from, lte: period.to },
    ...(matchedCustomer ? { customerId: matchedCustomer.id } : {}),
    ...(matchedProduct ? { items: { some: { productId: matchedProduct.id } } } : {}),
  };
  const refundWhere: any = {
    tenantId,
    status: "COMPLETED",
    createdAt: { gte: period.from, lte: period.to },
    ...(matchedCustomer ? { sale: { customerId: matchedCustomer.id } } : {}),
    ...(matchedProduct ? { items: { some: { productId: matchedProduct.id } } } : {}),
  };

  const [
    sales,
    refunds,
    saleQuantity,
    refundQuantity,
    productSales,
    productRefunds,
    customerSales,
    salePayments,
    refundPayments,
    recentSales,
    shifts,
    cashMovements,
    activeRestaurantOrders,
    completedRestaurantOrders,
    kitchenTickets,
    ledgerCashBalance,
  ] = await Promise.all([
    prisma.posSale.aggregate({ where: saleWhere, _sum: { total: true }, _count: { _all: true } }),
    prisma.posRefund.aggregate({ where: refundWhere, _sum: { total: true }, _count: { _all: true } }),
    prisma.posSaleItem.aggregate({ where: { sale: saleWhere, ...(matchedProduct ? { productId: matchedProduct.id } : {}) }, _sum: { quantity: true } }),
    prisma.posRefundItem.aggregate({ where: { refund: refundWhere, ...(matchedProduct ? { productId: matchedProduct.id } : {}) }, _sum: { quantity: true } }),
    prisma.posSaleItem.groupBy({
      by: ["productId"],
      where: { sale: saleWhere },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: 20,
    }),
    prisma.posRefundItem.groupBy({
      by: ["productId"],
      where: { refund: refundWhere },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: 20,
    }),
    prisma.posSale.groupBy({
      by: ["customerId"],
      where: { ...saleWhere, customerId: { not: null } },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: "desc" } },
      take: 20,
    }),
    prisma.posPayment.groupBy({
      by: ["method"],
      where: { sale: saleWhere },
      _sum: { amount: true },
    }),
    prisma.posRefundPayment.groupBy({
      by: ["method"],
      where: { refund: refundWhere },
      _sum: { amount: true },
    }),
    prisma.posSale.findMany({
      where: saleWhere,
      include: {
        customer: { select: { companyName: true } },
        register: { select: { name: true } },
        restaurantOrder: { select: { table: { select: { name: true } }, guests: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.posShift.findMany({
      where: {
        tenantId,
        OR: [
          { status: "OPEN" },
          { openedAt: { gte: period.from, lte: period.to } },
        ],
      },
      include: { register: { select: { code: true, name: true } } },
      orderBy: { openedAt: "desc" },
      take: 100,
    }),
    prisma.posCashMovement.findMany({
      where: { tenantId, requestedAt: { gte: period.from, lte: period.to } },
      orderBy: { requestedAt: "desc" },
      take: 100,
    }),
    prisma.restaurantOrder.findMany({
      where: { tenantId, status: { in: ["OPEN", "SENT", "PREPARING", "READY"] } },
      include: {
        table: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { openedAt: "asc" },
      take: 100,
    }),
    prisma.restaurantOrder.findMany({
      where: { tenantId, status: "COMPLETED", completedAt: { gte: period.from, lte: period.to } },
      select: { guests: true, posSale: { select: { total: true } } },
      take: 5000,
    }),
    prisma.restaurantKitchenTicket.findMany({
      where: { tenantId, sentAt: { gte: period.from, lte: period.to } },
      include: { order: { select: { number: true, table: { select: { name: true } } } } },
      orderBy: { sentAt: "desc" },
      take: 500,
    }),
    getLedgerCashBalance(tenantId),
  ]);

  const operatorIds = [...new Set([
    ...shifts.flatMap((shift) => [shift.userId, shift.closedById]),
    ...cashMovements.flatMap((movement) => [movement.requestedById, movement.approvedById]),
  ].filter(Boolean))] as string[];
  const productIds = [...new Set([...productSales, ...productRefunds].map((item) => item.productId))];
  const customerIds = customerSales.map((item) => item.customerId).filter(Boolean) as string[];
  const [operators, products, customers, inactiveProducts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: operatorIds } }, select: { id: true, name: true, username: true } }),
    prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, sku: true, name: true } }),
    prisma.customer.findMany({ where: { tenantId, id: { in: customerIds } }, select: { id: true, code: true, companyName: true } }),
    /滯銷|沒賣|未銷售/.test(question)
      ? prisma.product.findMany({
          where: { tenantId, isActive: true, id: { notIn: productSales.map((item) => item.productId) } },
          select: { id: true, sku: true, name: true, stocks: { select: { quantity: true } } },
          orderBy: { name: "asc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);
  const operatorMap = new Map(operators.map((operator) => [operator.id, operator.name || operator.username]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const refundProductMap = new Map(productRefunds.map((item) => [item.productId, item]));
  const refundPaymentMap = new Map(refundPayments.map((item) => [item.method, Number(item._sum.amount ?? 0)]));

  const openShifts = shifts.filter((shift) => shift.status === "OPEN");
  const openShiftCash = await Promise.all(openShifts.map(async (shift) => ({
    shiftId: shift.id,
    cash: await getPosShiftCashPosition(shift),
  })));
  const openShiftCashMap = new Map(openShiftCash.map((item) => [item.shiftId, item.cash]));
  const expectedCash = openShiftCash.reduce((sum, item) => sum + Number(item.cash?.expectedCash ?? 0), 0);
  const grossSales = Number(sales._sum.total ?? 0);
  const refundAmount = Number(refunds._sum.total ?? 0);
  const netSales = grossSales - refundAmount;
  const soldQuantity = Number(saleQuantity._sum.quantity ?? 0);
  const refundedQuantity = Number(refundQuantity._sum.quantity ?? 0);
  const netQuantity = soldQuantity - refundedQuantity;
  const saleCount = sales._count._all;
  const averageSale = saleCount > 0 ? netSales / saleCount : 0;
  const paymentRows = salePayments.map((item) => {
    const received = Number(item._sum.amount ?? 0);
    const refunded = refundPaymentMap.get(item.method) ?? 0;
    return {
      付款方式: PAYMENT_LABELS[item.method] ?? item.method,
      收款: money(received),
      退款: money(refunded),
      淨額: money(received - refunded),
    };
  });
  const cashPayment = paymentRows.find((row) => row.付款方式 === "現金")?.淨額 ?? money(0);
  const cardPayment = paymentRows.find((row) => row.付款方式 === "信用卡")?.淨額 ?? money(0);
  const pendingMovements = cashMovements.filter((movement) => movement.status === "PENDING");
  const longOpenShiftCount = openShifts.filter((shift) => Date.now() - shift.openedAt.getTime() >= 12 * 60 * 60 * 1000).length;
  const cashDifference = shifts
    .filter((shift) => shift.status === "CLOSED")
    .reduce((sum, shift) => sum + Number(shift.difference ?? 0), 0);
  const restaurantGuests = completedRestaurantOrders.reduce((sum, order) => sum + order.guests, 0);
  const restaurantRevenue = completedRestaurantOrders.reduce((sum, order) => sum + Number(order.posSale?.total ?? 0), 0);
  const averageTable = completedRestaurantOrders.length > 0 ? restaurantRevenue / completedRestaurantOrders.length : 0;
  const pendingKitchenTickets = kitchenTickets.filter((ticket) => ["NEW", "PREPARING", "READY"].includes(ticket.status));
  const preparedKitchenTickets = kitchenTickets.filter((ticket) => ticket.startedAt && ticket.readyAt);
  const servedKitchenTickets = kitchenTickets.filter((ticket) => ticket.sentAt && ticket.servedAt);
  const averagePreparationSeconds = preparedKitchenTickets.length > 0
    ? preparedKitchenTickets.reduce((sum, ticket) => sum + (ticket.readyAt!.getTime() - ticket.startedAt!.getTime()) / 1000, 0) / preparedKitchenTickets.length
    : 0;
  const averageServingSeconds = servedKitchenTickets.length > 0
    ? servedKitchenTickets.reduce((sum, ticket) => sum + (ticket.servedAt!.getTime() - ticket.sentAt.getTime()) / 1000, 0) / servedKitchenTickets.length
    : 0;
  const durationValue = (seconds: number) => seconds <= 0 ? "—" : seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒` : `${Math.round(seconds)} 秒`;

  const productRows = productSales.map((item) => {
    const product = productMap.get(item.productId);
    const refunded = refundProductMap.get(item.productId);
    const quantity = Number(item._sum.quantity ?? 0);
    const refundQty = Number(refunded?._sum.quantity ?? 0);
    return {
      SKU: product?.sku ?? "",
      商品: product?.name ?? "未知商品",
      售出數量: decimal(quantity),
      退款數量: decimal(refundQty),
      淨售數量: decimal(quantity - refundQty),
      銷售額: money(Number(item._sum.subtotal ?? 0)),
    };
  });
  const customerRows = customerSales.map((item) => {
    const customer = item.customerId ? customerMap.get(item.customerId) : null;
    const count = item._count._all;
    const total = Number(item._sum.total ?? 0);
    return {
      客戶: customer?.companyName ?? "未知客戶",
      客戶代碼: customer?.code ?? "",
      交易筆數: count,
      消費金額: money(total),
      平均客單價: money(count > 0 ? total / count : 0),
    };
  });
  const shiftRows = shifts.map((shift) => {
    const cash = openShiftCashMap.get(shift.id);
    return {
      收銀台: `${shift.register.code}・${shift.register.name}`,
      狀態: shift.status === "OPEN" ? "未結班" : "已結班",
      開班人員: operatorMap.get(shift.userId) ?? "未知人員",
      結班人員: shift.closedById ? operatorMap.get(shift.closedById) ?? "未知人員" : "—",
      開班時間: fmtDateTime(shift.openedAt),
      結班時間: fmtDateTime(shift.closedAt),
      開班庫存現金: money(Number(shift.openingCash)),
      應有現金: money(Number(cash?.expectedCash ?? shift.expectedCash ?? shift.openingCash)),
      現金差額: shift.difference === null ? "—" : money(Number(shift.difference)),
    };
  });
  const movementRows = cashMovements.map((movement) => ({
    時間: fmtDateTime(movement.requestedAt),
    類型: MOVEMENT_LABELS[movement.type] ?? movement.type,
    金額: money(Number(movement.amount)),
    原因: movement.reason,
    申請人: operatorMap.get(movement.requestedById) ?? "未知人員",
    核准人: movement.approvedById ? operatorMap.get(movement.approvedById) ?? "未知人員" : "—",
    狀態: MOVEMENT_STATUS_LABELS[movement.status] ?? movement.status,
  }));
  const restaurantRows = activeRestaurantOrders.map((order) => ({
    桌位: order.table.name,
    桌單: order.number,
    狀態: RESTAURANT_STATUS_LABELS[order.status] ?? order.status,
    人數: order.guests,
    金額: money(order.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)),
    開桌時間: fmtDateTime(order.openedAt),
    待處理餐點: order.items
      .filter((item) => !["SERVED", "CANCELLED"].includes(item.status))
      .map((item) => `${item.product.name}×${decimal(Number(item.quantity))}`)
      .join("、") || "—",
  }));
  const kitchenRows = kitchenTickets.map((ticket) => ({
    桌位: ticket.order.table.name,
    桌單: ticket.order.number,
    廚房狀態: RESTAURANT_STATUS_LABELS[ticket.status] ?? ticket.status,
    送廚時間: fmtDateTime(ticket.sentAt),
    開始製作: fmtDateTime(ticket.startedAt),
    完成待出: fmtDateTime(ticket.readyAt),
    實際出餐: fmtDateTime(ticket.servedAt),
    製作耗時: fmtDuration(ticket.startedAt, ticket.readyAt),
    總出餐時間: fmtDuration(ticket.sentAt, ticket.servedAt),
  }));
  const recentSaleRows = recentSales.map((sale) => ({
    時間: fmtDateTime(sale.createdAt),
    單號: sale.number,
    來源: sale.restaurantOrder ? `餐飲・${sale.restaurantOrder.table.name}` : "一般 POS",
    客戶: sale.customer?.companyName ?? "門市散客",
    收銀台: sale.register.name,
    金額: money(Number(sale.total)),
    狀態: sale.status,
  }));
  const inactiveRows = inactiveProducts.map((product) => ({
    SKU: product.sku,
    商品: product.name,
    目前庫存: decimal(product.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0)),
    期間: period.label,
  }));

  const tables: ReportResult["tables"] = [];
  const wantsShift = /班次|開班|結班|開店人員|收銀台|未結班/.test(question);
  const wantsCash = /現金|錢櫃|零用金|備用金|投入|提出|抽離|短溢|差額|付款方式|刷卡/.test(question);
  const wantsRestaurant = /餐飲|餐點|桌位|桌均|開桌|出餐|送廚|待上菜|廚房|用餐|未結帳/.test(question);
  const wantsProduct = /商品|產品|貨品|品項|餐點|熱賣|滯銷|退款最多|銷售數量/.test(question);
  const wantsCustomer = /客戶|會員|消費|回購/.test(question);
  const focused = wantsShift || wantsCash || wantsRestaurant || wantsProduct || wantsCustomer;
  if (wantsShift || !focused) tables.push({ title: "開班／結班紀錄", columns: ["收銀台", "狀態", "開班人員", "結班人員", "開班時間", "結班時間", "開班庫存現金", "應有現金", "現金差額"], rows: shiftRows });
  if (wantsCash || !focused) {
    tables.push({ title: "付款方式", columns: ["付款方式", "收款", "退款", "淨額"], rows: paymentRows });
    tables.push({ title: "錢櫃投入／提出／抽離", columns: ["時間", "類型", "金額", "原因", "申請人", "核准人", "狀態"], rows: movementRows });
  }
  if (wantsProduct || !focused) tables.push({ title: matchedProduct ? `${matchedProduct.name} POS 銷售` : "POS 商品／餐點排行", columns: ["SKU", "商品", "售出數量", "退款數量", "淨售數量", "銷售額"], rows: productRows });
  if (wantsCustomer || !focused) tables.push({ title: matchedCustomer ? `${matchedCustomer.companyName} POS 消費` : "POS 客戶消費排行", columns: ["客戶", "客戶代碼", "交易筆數", "消費金額", "平均客單價"], rows: customerRows });
  if (wantsRestaurant || !focused) {
    tables.push({ title: "餐飲未結帳桌位", columns: ["桌位", "桌單", "狀態", "人數", "金額", "開桌時間", "待處理餐點"], rows: restaurantRows });
    tables.push({ title: "廚房出餐時間", columns: ["桌位", "桌單", "廚房狀態", "送廚時間", "開始製作", "完成待出", "實際出餐", "製作耗時", "總出餐時間"], rows: kitchenRows });
  }
  if (/滯銷|沒賣|未銷售/.test(question)) tables.push({ title: "期間未銷售商品", columns: ["SKU", "商品", "目前庫存", "期間"], rows: inactiveRows });
  if (!focused || /訂單|交易|明細/.test(question)) tables.push({ title: "POS 最近交易", columns: ["時間", "單號", "來源", "客戶", "收銀台", "金額", "狀態"], rows: recentSaleRows });

  return {
    kind: "pos-operations",
    title: matchedCustomer
      ? `${matchedCustomer.companyName} POS 營運查詢`
      : matchedProduct
        ? `${matchedProduct.name} POS 銷售查詢`
        : "一般 POS／餐飲 POS 營運查詢",
    description: `${period.label}資料；營業額已扣除完成退款。開班應有現金來自班次錢櫃，庫存現金來自已過帳總帳。`,
    criteria: {
      期間: period.label,
      客戶: matchedCustomer?.companyName,
      商品: matchedProduct?.name,
    },
    cards: [
      { label: `${period.label}淨營業額`, value: money(netSales) },
      { label: "交易筆數", value: `${saleCount} 筆` },
      { label: "淨售數量", value: decimal(netQuantity) },
      { label: "平均客單價", value: money(averageSale) },
      { label: "現金淨收", value: cashPayment },
      { label: "刷卡淨收", value: cardPayment },
      { label: "目前未結班", value: `${openShifts.length} 班` },
      { label: "本班應有現金合計", value: money(expectedCash) },
      { label: "總帳庫存現金", value: money(ledgerCashBalance) },
      { label: "待核准錢櫃異動", value: `${pendingMovements.length} 筆` },
      { label: "期間現金差額", value: money(cashDifference) },
      { label: "未結班超過 12 小時", value: `${longOpenShiftCount} 班` },
      { label: "未結帳桌位", value: `${activeRestaurantOrders.length} 桌` },
      { label: "廚房待處理", value: `${pendingKitchenTickets.length} 張` },
      { label: "平均製作時間", value: durationValue(averagePreparationSeconds) },
      { label: "平均總出餐時間", value: durationValue(averageServingSeconds) },
      { label: `${period.label}用餐人數`, value: `${restaurantGuests} 人` },
      { label: "平均桌單", value: money(averageTable) },
      { label: "退款金額", value: money(refundAmount) },
      { label: "退款筆數", value: `${refunds._count._all} 筆` },
    ],
    tables,
  };
}
