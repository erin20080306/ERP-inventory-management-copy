import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────────────────────
// 智慧補貨預測
//
// 以 InventoryTransaction 的 SALES_OUT（統一庫存流水，含 POS／銷售單／出貨）估算
// 日均需求，再結合前置期與安全庫存推導「再訂購點」與「建議採購量」，讓系統從
// 「快沒貨了提醒你」升級成「採購單我幫你算好了」。
//
// 公式：
//   日均需求      avgDailyDemand = 期間 SALES_OUT 總量 / 觀察天數（近期加速時上調）
//   再訂購點      reorderPoint   = 日均需求 × 前置期 + 安全庫存
//   目標水位      targetLevel    = 再訂購點 + 日均需求 × 補貨週期
//   建議採購量    suggestedQty   = ceil( 目標水位 − 現有庫存 − 在途量 )，下限 0
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_DEMAND_WINDOW_DAYS = 30; // 需求觀察期
export const DEFAULT_LEAD_TIME_DAYS = 7; // 找不到前置期時的保底值
export const DEFAULT_REVIEW_DAYS = 7; // 補貨週期（希望這批貨撐幾天）
const RECENT_WINDOW_DAYS = 7; // 近期加速偵測視窗
const TREND_TRIGGER = 1.2; // 近期日均超過整體 1.2 倍視為上升趨勢

// 視為「在途」的採購單狀態（已下單、尚未完全入庫）
const OPEN_PURCHASE_STATUSES = ["SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED"] as const;

export type ReorderUrgency = "critical" | "warning" | "ok";

export type ReorderSuggestion = {
  productId: string;
  sku: string;
  name: string;
  spec: string | null;
  onHand: number; // 現有庫存（跨倉加總）
  onOrder: number; // 在途量（已下單未收貨）
  avgDailyDemand: number; // 日均需求
  demandWindowDays: number;
  daysOfCover: number | null; // 現貨可支撐天數（現貨 / 日均需求）
  leadTimeDays: number;
  leadTimeSource: "product" | "supplier" | "history" | "default";
  safetyStock: number;
  reorderPoint: number;
  targetLevel: number;
  suggestedQty: number;
  costPrice: number;
  estimatedCost: number; // 建議量 × 成本
  supplierId: string | null;
  supplierName: string;
  supplierSource: "preferred" | "history" | "none";
  urgency: ReorderUrgency;
  reason: string;
};

export type ReorderOptions = {
  demandWindowDays?: number;
  reviewDays?: number;
  /** 只回傳需要補貨（suggestedQty > 0）的品項，預設 true */
  onlyActionable?: boolean;
};

function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 依「商品覆寫 → 供應商預設 → 歷史推算 → 系統保底」的順序決定前置期。
 */
function resolveLeadTime(
  productLeadTime: number | null | undefined,
  supplierLeadTime: number | null | undefined,
  historyLeadTime: number | undefined
): { days: number; source: ReorderSuggestion["leadTimeSource"] } {
  if (productLeadTime && productLeadTime > 0) return { days: productLeadTime, source: "product" };
  if (supplierLeadTime && supplierLeadTime > 0) return { days: supplierLeadTime, source: "supplier" };
  if (historyLeadTime && historyLeadTime > 0) return { days: Math.round(historyLeadTime), source: "history" };
  return { days: DEFAULT_LEAD_TIME_DAYS, source: "default" };
}

/**
 * 從整體與近期兩段需求推估日均需求，近期明顯加速時上調以更快反應趨勢。
 */
export function estimateDailyDemand(
  windowQty: number,
  windowDays: number,
  recentQty: number,
  recentDays: number
): number {
  const overall = windowDays > 0 ? windowQty / windowDays : 0;
  const recent = recentDays > 0 ? recentQty / recentDays : 0;
  // 近期需求顯著高於整體 → 取兩者平均以兼顧穩定與敏感；否則以整體為準。
  if (recent > overall * TREND_TRIGGER) return (overall + recent) / 2;
  return overall;
}

type SupplierRef = { id: string; name: string; source: "preferred" | "history" };

/**
 * 掃描單一租戶的補貨建議。純讀取、不寫入。
 */
export async function computeReorderSuggestions(
  tenantId: string,
  options: ReorderOptions = {}
): Promise<ReorderSuggestion[]> {
  const windowDays = options.demandWindowDays ?? DEFAULT_DEMAND_WINDOW_DAYS;
  const reviewDays = options.reviewDays ?? DEFAULT_REVIEW_DAYS;
  const onlyActionable = options.onlyActionable ?? true;

  const now = Date.now();
  const windowStart = new Date(now - windowDays * 86_400_000);
  const recentStart = new Date(now - RECENT_WINDOW_DAYS * 86_400_000);

  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true, isArchived: false, trackInventory: true },
    select: {
      id: true,
      sku: true,
      name: true,
      spec: true,
      costPrice: true,
      safetyStock: true,
      leadTimeDays: true,
      reorderReviewDays: true,
      preferredSupplierId: true,
      preferredSupplier: { select: { id: true, companyName: true, leadTimeDays: true } },
      stocks: { select: { quantity: true } },
    },
  });
  if (products.length === 0) return [];

  const productIds = products.map((p) => p.id);

  // 需求：期間與近期各做一次 SALES_OUT 加總（quantity 為負，取絕對值）
  const [windowDemand, recentDemand] = await Promise.all([
    prisma.inventoryTransaction.groupBy({
      by: ["productId"],
      where: { tenantId, productId: { in: productIds }, type: "SALES_OUT", createdAt: { gte: windowStart } },
      _sum: { quantity: true },
    }),
    prisma.inventoryTransaction.groupBy({
      by: ["productId"],
      where: { tenantId, productId: { in: productIds }, type: "SALES_OUT", createdAt: { gte: recentStart } },
      _sum: { quantity: true },
    }),
  ]);
  const windowQtyByProduct = new Map<string, number>();
  for (const row of windowDemand) windowQtyByProduct.set(row.productId, Math.abs(toNum(row._sum.quantity)));
  const recentQtyByProduct = new Map<string, number>();
  for (const row of recentDemand) recentQtyByProduct.set(row.productId, Math.abs(toNum(row._sum.quantity)));

  // 在途量：未完全入庫的採購單，逐項 (quantity − receivedQty) 加總
  const openItems = await prisma.purchaseOrderItem.findMany({
    where: { productId: { in: productIds }, order: { tenantId, status: { in: [...OPEN_PURCHASE_STATUSES] } } },
    select: { productId: true, quantity: true, receivedQty: true },
  });
  const onOrderByProduct = new Map<string, number>();
  for (const item of openItems) {
    const remaining = Math.max(toNum(item.quantity) - toNum(item.receivedQty), 0);
    onOrderByProduct.set(item.productId, (onOrderByProduct.get(item.productId) ?? 0) + remaining);
  }

  // 供應商：優先採購主檔設定的 preferredSupplier，否則取最近一次採購紀錄
  const historyPOItems = await prisma.purchaseOrderItem.findMany({
    where: { productId: { in: productIds }, order: { tenantId } },
    select: {
      productId: true,
      order: { select: { supplierId: true, orderDate: true, supplier: { select: { companyName: true } } } },
    },
    orderBy: { order: { orderDate: "desc" } },
  });
  const lastSupplierByProduct = new Map<string, SupplierRef>();
  for (const item of historyPOItems) {
    if (!lastSupplierByProduct.has(item.productId)) {
      lastSupplierByProduct.set(item.productId, {
        id: item.order.supplierId,
        name: item.order.supplier.companyName,
        source: "history",
      });
    }
  }

  // 各供應商歷史平均前置期：已收貨採購單的 (receivedAt − orderDate)
  const receivedPOs = await prisma.purchaseOrder.findMany({
    where: { tenantId, receivedAt: { not: null } },
    select: { supplierId: true, orderDate: true, receivedAt: true },
  });
  const leadAgg = new Map<string, { sum: number; count: number }>();
  for (const po of receivedPOs) {
    if (!po.receivedAt) continue;
    const days = (po.receivedAt.getTime() - po.orderDate.getTime()) / 86_400_000;
    if (days <= 0 || days > 365) continue; // 濾除異常值
    const agg = leadAgg.get(po.supplierId) ?? { sum: 0, count: 0 };
    agg.sum += days;
    agg.count += 1;
    leadAgg.set(po.supplierId, agg);
  }
  const historyLeadBySupplier = new Map<string, number>();
  for (const [supplierId, agg] of leadAgg) {
    if (agg.count > 0) historyLeadBySupplier.set(supplierId, agg.sum / agg.count);
  }

  const suggestions: ReorderSuggestion[] = [];

  for (const product of products) {
    const onHand = product.stocks.reduce((sum, s) => sum + toNum(s.quantity), 0);
    const onOrder = onOrderByProduct.get(product.id) ?? 0;
    const safetyStock = toNum(product.safetyStock);

    const avgDailyDemand = estimateDailyDemand(
      windowQtyByProduct.get(product.id) ?? 0,
      windowDays,
      recentQtyByProduct.get(product.id) ?? 0,
      RECENT_WINDOW_DAYS
    );

    // 供應商：偏好供應商優先
    let supplier: SupplierRef | null = null;
    if (product.preferredSupplier) {
      supplier = { id: product.preferredSupplier.id, name: product.preferredSupplier.companyName, source: "preferred" };
    } else {
      supplier = lastSupplierByProduct.get(product.id) ?? null;
    }

    const lead = resolveLeadTime(
      product.leadTimeDays,
      product.preferredSupplier?.leadTimeDays,
      supplier ? historyLeadBySupplier.get(supplier.id) : undefined
    );

    const productReviewDays = product.reorderReviewDays && product.reorderReviewDays > 0 ? product.reorderReviewDays : reviewDays;

    const reorderPoint = avgDailyDemand * lead.days + safetyStock;
    const targetLevel = reorderPoint + avgDailyDemand * productReviewDays;
    const available = onHand + onOrder;
    const suggestedQty = Math.max(Math.ceil(targetLevel - available), 0);

    // 完全沒有需求也沒設安全庫存的靜止品項，直接略過
    if (avgDailyDemand === 0 && safetyStock === 0) continue;

    const daysOfCover = avgDailyDemand > 0 ? onHand / avgDailyDemand : null;
    let urgency: ReorderUrgency = "ok";
    if (available <= reorderPoint) urgency = "warning";
    if (onHand <= safetyStock || (daysOfCover !== null && daysOfCover <= lead.days)) urgency = "critical";

    const costPrice = toNum(product.costPrice);

    const reasonParts: string[] = [];
    reasonParts.push(`近${windowDays}天日均需求 ${avgDailyDemand.toFixed(2)}`);
    reasonParts.push(`前置期 ${lead.days} 天`);
    if (safetyStock > 0) reasonParts.push(`安全庫存 ${safetyStock}`);
    reasonParts.push(`再訂購點 ${reorderPoint.toFixed(1)}`);
    if (onOrder > 0) reasonParts.push(`在途 ${onOrder}`);

    suggestions.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      spec: product.spec,
      onHand,
      onOrder,
      avgDailyDemand: Math.round(avgDailyDemand * 100) / 100,
      demandWindowDays: windowDays,
      daysOfCover: daysOfCover === null ? null : Math.round(daysOfCover * 10) / 10,
      leadTimeDays: lead.days,
      leadTimeSource: lead.source,
      safetyStock,
      reorderPoint: Math.round(reorderPoint * 100) / 100,
      targetLevel: Math.round(targetLevel * 100) / 100,
      suggestedQty,
      costPrice,
      estimatedCost: Math.round(suggestedQty * costPrice * 100) / 100,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? "尚無採購紀錄",
      supplierSource: supplier?.source ?? "none",
      urgency,
      reason: reasonParts.join("、"),
    });
  }

  const filtered = onlyActionable ? suggestions.filter((s) => s.suggestedQty > 0) : suggestions;

  // 先急迫、再依建議金額由大到小
  const urgencyRank: Record<ReorderUrgency, number> = { critical: 0, warning: 1, ok: 2 };
  filtered.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || b.estimatedCost - a.estimatedCost);

  return filtered;
}

export type SupplierDraftGroup = {
  supplierId: string;
  supplierName: string;
  items: ReorderSuggestion[];
  totalQty: number;
  estimatedCost: number;
};

/**
 * 將補貨建議依供應商分組，供「一鍵生成採購草稿」逐供應商開單。
 * 沒有可對應供應商（supplierId 為 null）的品項不納入自動開單。
 */
export function groupSuggestionsBySupplier(suggestions: ReorderSuggestion[]): SupplierDraftGroup[] {
  const groups = new Map<string, SupplierDraftGroup>();
  for (const s of suggestions) {
    if (!s.supplierId || s.suggestedQty <= 0) continue;
    let group = groups.get(s.supplierId);
    if (!group) {
      group = { supplierId: s.supplierId, supplierName: s.supplierName, items: [], totalQty: 0, estimatedCost: 0 };
      groups.set(s.supplierId, group);
    }
    group.items.push(s);
    group.totalQty += s.suggestedQty;
    group.estimatedCost += s.estimatedCost;
  }
  return Array.from(groups.values()).sort((a, b) => b.estimatedCost - a.estimatedCost);
}
