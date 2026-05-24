import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已送審",
  APPROVED: "已審核",
  POSTED: "已過帳",
  VOIDED: "已作廢",
  REJECTED: "已駁回",
};

type TableValue = string | number | null;

export type AssistantCard = {
  label: string;
  value: string;
};

export type AssistantTable = {
  title: string;
  columns: string[];
  rows: Array<Record<string, TableValue>>;
};

export type ReportResult = {
  kind:
    | "sales-summary"
    | "inventory-alerts"
    | "receivables-collection"
    | "product-ranking"
    | "purchase-suggestions"
    | "bom-cost"
    | "order-anomalies"
    | "monthly-summary"
    | "journal-account-review"
    | "financial-anomalies"
    | "price-variance";
  title: string;
  description: string;
  criteria?: Record<string, string | number | undefined>;
  cards: AssistantCard[];
  tables: AssistantTable[];
};

export type HelpResult = {
  kind: "help";
  title: string;
  message: string;
  examples: string[];
};

export type AssistantResult = ReportResult | HelpResult;

function getCurrentYear() {
  return new Date().getFullYear();
}

function compactName(input: string) {
  return input.toLowerCase().replace(/\s+/g, "");
}

function stripQueryNoise(input: string) {
  return compactName(input)
    .replace(
      /sales|sale|top|bom|銷售排行|銷售|業績|營收|統計|查詢|資料|明細|全部|所有|公司|股份|有限|有限公司|客戶|庫存|安全|低於|提醒|應收|帳款|催收|清單|逾期|毛利|排行|產品|商品|採購|建議|補貨|供應商|成本|分析|異常|訂單|偵測|本月|營運|摘要|寄給|老闆/g,
      ""
    )
    .replace(/民國\d{2,3}年?/g, "")
    .replace(/\d{4}[年/-]?\d{0,2}月?/g, "")
    .replace(/\d{1,2}月/g, "")
    .replace(/[0-9/.\-_年月日]/g, "");
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parsePeriod(question: string, defaultMode: "all" | "current-month" | "last-30" = "all") {
  const now = new Date();
  const rocYear = question.match(/民國\s*(\d{2,3})\s*年/);
  const westernYear = question.match(/(\d{4})\s*年/);
  const slashDate = question.match(/(\d{4})[/-](\d{1,2})/);
  const monthOnly = question.match(/(\d{1,2})\s*月/);
  const yearOnly = question.match(/(\d{4})/);

  if (/上月|上個月/.test(question)) {
    const base = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = base.getFullYear();
    const month = base.getMonth() + 1;
    return {
      year,
      month,
      from: new Date(year, month - 1, 1, 0, 0, 0, 0),
      to: new Date(year, month, 0, 23, 59, 59, 999),
      label: `${year} 年 ${month} 月`,
    };
  }

  if (/本月|這個月|這月|當月/.test(question)) {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return {
      year,
      month,
      from: new Date(year, month - 1, 1, 0, 0, 0, 0),
      to: new Date(year, month, 0, 23, 59, 59, 999),
      label: `${year} 年 ${month} 月`,
    };
  }

  if (slashDate || monthOnly) {
    const year = slashDate
      ? Number(slashDate[1])
      : westernYear
        ? Number(westernYear[1])
        : rocYear
          ? Number(rocYear[1]) + 1911
          : getCurrentYear();
    const month = slashDate ? Number(slashDate[2]) : Number(monthOnly?.[1]);
    if (month < 1 || month > 12) throw new Error("月份需要介於 1 到 12。");
    return {
      year,
      month,
      from: new Date(year, month - 1, 1, 0, 0, 0, 0),
      to: new Date(year, month, 0, 23, 59, 59, 999),
      label: `${year} 年 ${month} 月`,
    };
  }

  if (westernYear || rocYear || yearOnly) {
    const year = westernYear ? Number(westernYear[1]) : rocYear ? Number(rocYear[1]) + 1911 : Number(yearOnly?.[1]);
    return {
      year,
      from: new Date(year, 0, 1, 0, 0, 0, 0),
      to: new Date(year, 11, 31, 23, 59, 59, 999),
      label: `${year} 年`,
    };
  }

  if (defaultMode === "current-month") {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return {
      year,
      month,
      from: new Date(year, month - 1, 1, 0, 0, 0, 0),
      to: new Date(year, month, 0, 23, 59, 59, 999),
      label: `${year} 年 ${month} 月`,
    };
  }

  if (defaultMode === "last-30") {
    const from = startOfDay(new Date(now.getTime() - 30 * 86400000));
    return { from, to: endOfDay(now), label: "近 30 天" };
  }

  return { label: "全部期間" };
}

function periodWhere(period: ReturnType<typeof parsePeriod>, field: string) {
  return period.from && period.to ? { [field]: { gte: period.from, lte: period.to } } : {};
}

function scoreName(question: string, candidate: string, code?: string | null) {
  const normalizedQuestion = compactName(question);
  const normalizedHint = stripQueryNoise(question);
  const name = compactName(candidate);
  const normalizedCode = compactName(code ?? "");

  if (name && normalizedQuestion.includes(name)) return 1000 + name.length;
  if (normalizedCode && normalizedQuestion.includes(normalizedCode)) return 800 + normalizedCode.length;
  if (normalizedHint.length >= 2 && name.includes(normalizedHint)) return 650 + normalizedHint.length;

  const uniqueHintChars = Array.from(new Set(normalizedHint.split("").filter(Boolean)));
  if (uniqueHintChars.length < 2) return 0;
  const matched = uniqueHintChars.filter((char) => name.includes(char)).length;
  const ratio = matched / uniqueHintChars.length;
  return ratio >= 0.65 ? Math.round(ratio * 100) + matched : 0;
}

async function findCustomer(tenantId: string, question: string) {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true, companyName: true, code: true },
    orderBy: { companyName: "asc" },
  });
  const ranked = customers
    .map((customer) => ({ customer, score: scoreName(question, customer.companyName, customer.code) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.customer;
}

async function findProduct(tenantId: string, question: string) {
  const products = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, sku: true, name: true },
    orderBy: { name: "asc" },
  });
  const ranked = products
    .map((product) => ({ product, score: scoreName(question, product.name, product.sku) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.product;
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function fmtMoney(value: number) {
  return `NT$ ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtDecimal(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtPercent(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "未設定";
  return new Date(value).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function dateDiffDays(from: Date, to = new Date()) {
  return Math.max(0, Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000));
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function table(title: string, columns: string[], rows: Array<Record<string, TableValue>>): AssistantTable {
  return { title, columns, rows };
}

export function getAssistantPermissionCode(question: string) {
  const text = String(question ?? "");
  if (/傳票|分錄|切帳|切科目|科目.*正確|會計科目/i.test(text)) return "journals.view";
  if (/財報|財務報表|帳務|資產負債|損益|試算表|會計異常/i.test(text)) return "reports.view";
  if (/應收|催收|逾期|收款|未收/i.test(text)) return "receivables.view";
  if (/應付|付款|未付/i.test(text)) return "payables.view";
  if (/庫存低|安全量|安全庫存|庫存警示|低於安全|零庫存|bom|BOM|成本分析|商品成本|庫存成本/i.test(text)) return "inventory.view";
  if (/採購建議|補貨|請購|供應商|缺貨/i.test(text)) return "purchases.view";
  if (/營運摘要|月報|老闆|主管摘要|經營摘要/i.test(text)) return "reports.view";
  return "sales.view";
}

function emptyHelp(): HelpResult {
  return {
    kind: "help",
    title: "可以查詢 ERP 營運資料",
    message: "請輸入想看的主題、客戶/商品關鍵字與期間。客戶名稱不用全名，像「高雄貿易銷售」也可以。",
    examples: [
      "高雄貿易銷售",
      "庫存低於安全量提醒",
      "客戶應收帳款催收清單",
      "產品毛利銷售排行",
      "供應商採購建議",
      "BOM 成本分析",
      "異常訂單偵測",
      "傳票科目異常檢查",
      "財報異常分析",
      "商品單價異動",
      "本月營運摘要寄給老闆",
    ],
  };
}

async function loadSalesOrders(tenantId: string, customerId: string | undefined, period: ReturnType<typeof parsePeriod>) {
  return prisma.salesOrder.findMany({
    where: {
      tenantId,
      ...(customerId ? { customerId } : {}),
      ...periodWhere(period, "orderDate"),
    },
    include: {
      customer: { select: { companyName: true } },
      items: { include: { product: { select: { sku: true, name: true, costPrice: true } } } },
    },
    orderBy: { orderDate: "asc" },
  });
}

function buildSalesSummary(orders: Awaited<ReturnType<typeof loadSalesOrders>>) {
  const statusMap = new Map<string, { status: string; count: number; total: number }>();
  const productMap = new Map<string, { sku: string; name: string; quantity: number; amount: number; cost: number; grossProfit: number }>();
  let subtotal = 0;
  let taxAmount = 0;
  let total = 0;

  for (const order of orders) {
    subtotal += toNumber(order.subtotal);
    taxAmount += toNumber(order.taxAmount);
    total += toNumber(order.total);

    const status = statusMap.get(order.status) ?? { status: STATUS_LABELS[order.status] ?? order.status, count: 0, total: 0 };
    status.count += 1;
    status.total += toNumber(order.total);
    statusMap.set(order.status, status);

    for (const item of order.items) {
      const current = productMap.get(item.productId) ?? {
        sku: item.product?.sku ?? "",
        name: item.product?.name ?? "未命名商品",
        quantity: 0,
        amount: 0,
        cost: 0,
        grossProfit: 0,
      };
      const quantity = toNumber(item.quantity);
      const amount = toNumber(item.subtotal);
      const cost = quantity * toNumber(item.product?.costPrice);
      current.quantity += quantity;
      current.amount += amount;
      current.cost += cost;
      current.grossProfit += amount - cost;
      productMap.set(item.productId, current);
    }
  }

  return {
    orderCount: orders.length,
    subtotal,
    taxAmount,
    total,
    averageOrderValue: orders.length ? total / orders.length : 0,
    statusRows: Array.from(statusMap.values()).sort((a, b) => b.total - a.total),
    productRows: Array.from(productMap.values()).sort((a, b) => b.amount - a.amount),
  };
}

async function buildSalesReport(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question);
  const customer = await findCustomer(tenantId, question);
  const orders = await loadSalesOrders(tenantId, customer?.id, period);
  const summary = buildSalesSummary(orders);
  const customerName = customer?.companyName ?? "全部客戶";

  return {
    kind: "sales-summary",
    title: `${customerName} ${period.label}銷售統計`,
    description: "依銷售單日期統計，金額以銷售單總計為準。",
    criteria: { customerName, period: period.label },
    cards: [
      { label: "訂單數", value: `${fmtDecimal(summary.orderCount)} 筆` },
      { label: "銷售總額", value: fmtMoney(summary.total) },
      { label: "未稅小計", value: fmtMoney(summary.subtotal) },
      { label: "平均客單價", value: fmtMoney(summary.averageOrderValue) },
    ],
    tables: [
      table(
        "客戶彙總",
        ["客戶", "訂單數", "銷售額"],
        Array.from(
          orders.reduce((map, order) => {
            const current = map.get(order.customer.companyName) ?? { count: 0, total: 0 };
            current.count += 1;
            current.total += toNumber(order.total);
            map.set(order.customer.companyName, current);
            return map;
          }, new Map<string, { count: number; total: number }>())
        )
          .map(([customer, row]) => ({ 客戶: customer, 訂單數: row.count, 銷售額: fmtMoney(row.total) }))
          .sort((a, b) => Number(String(b.銷售額).replace(/[^0-9.-]/g, "")) - Number(String(a.銷售額).replace(/[^0-9.-]/g, "")))
      ),
      table(
        "狀態統計",
        ["狀態", "筆數", "金額"],
        summary.statusRows.map((row) => ({ 狀態: row.status, 筆數: row.count, 金額: fmtMoney(row.total) }))
      ),
      table(
        "商品彙總",
        ["SKU", "商品", "數量", "金額", "毛利估算"],
        summary.productRows.map((row) => ({
          SKU: row.sku || "—",
          商品: row.name,
          數量: fmtDecimal(row.quantity),
          金額: fmtMoney(row.amount),
          毛利估算: fmtMoney(row.grossProfit),
        }))
      ),
      table(
        "訂單明細",
        ["日期", "單號", "客戶", "狀態", "總計"],
        orders.map((order) => ({
          日期: fmtDate(order.orderDate),
          單號: order.number,
          客戶: order.customer.companyName,
          狀態: STATUS_LABELS[order.status] ?? order.status,
          總計: fmtMoney(toNumber(order.total)),
        }))
      ),
    ],
  };
}

async function buildInventoryAlerts(tenantId: string, question: string): Promise<ReportResult> {
  const product = await findProduct(tenantId, question);
  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true, ...(product ? { id: product.id } : {}) },
    include: { stocks: { include: { warehouse: true } } },
    orderBy: { sku: "asc" },
  });
  const rows = products
    .map((item) => {
      const totalStock = item.stocks.reduce((sum, stock) => sum + toNumber(stock.quantity), 0);
      const safetyStock = toNumber(item.safetyStock);
      const shortage = Math.max(safetyStock - totalStock, 0);
      return {
        sku: item.sku,
        name: item.name,
        safetyStock,
        totalStock,
        shortage,
        stockValue: totalStock * toNumber(item.costPrice),
        warehouseText: item.stocks.map((stock) => `${stock.warehouse.name}:${fmtDecimal(toNumber(stock.quantity))}`).join(" / ") || "無庫存紀錄",
      };
    })
    .filter((item) => item.shortage > 0 || item.totalStock <= 0)
    .sort((a, b) => b.shortage - a.shortage || a.totalStock - b.totalStock)
    .slice(0, 80);

  return {
    kind: "inventory-alerts",
    title: product ? `${product.name} 庫存安全量提醒` : "庫存低於安全量提醒",
    description: "列出低於安全庫存或零庫存的品項，協助立即補貨或盤點。",
    cards: [
      { label: "警示品項", value: `${rows.length} 項` },
      { label: "總缺口", value: fmtDecimal(rows.reduce((sum, row) => sum + row.shortage, 0)) },
      { label: "零庫存品項", value: `${rows.filter((row) => row.totalStock <= 0).length} 項` },
      { label: "現有庫存成本", value: fmtMoney(rows.reduce((sum, row) => sum + row.stockValue, 0)) },
    ],
    tables: [
      table(
        "庫存警示清單",
        ["SKU", "商品", "安全庫存", "目前庫存", "缺口", "倉庫庫存", "建議"],
        rows.map((row) => ({
          SKU: row.sku,
          商品: row.name,
          安全庫存: fmtDecimal(row.safetyStock),
          目前庫存: fmtDecimal(row.totalStock),
          缺口: fmtDecimal(row.shortage),
          倉庫庫存: row.warehouseText,
          建議: row.shortage > 0 ? "建議補貨" : "建議盤點",
        }))
      ),
    ],
  };
}

async function buildReceivablesCollection(tenantId: string, question: string): Promise<ReportResult> {
  const customer = await findCustomer(tenantId, question);
  const collectionMode = /催收|逾期|未收|收款|欠款|收不回/i.test(question);
  const receivables = await prisma.accountsReceivable.findMany({
    where: {
      tenantId,
      ...(customer ? { customerId: customer.id } : {}),
      status: { notIn: ["VOIDED", "REJECTED"] },
    },
    include: {
      customer: { select: { companyName: true, contactName: true, phone: true, email: true } },
      salesOrder: { select: { number: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  const rows = receivables
    .map((item) => {
      const amount = toNumber(item.amount);
      const paid = toNumber(item.paidAmount);
      const balance = Math.max(amount - paid, 0);
      const overdueDays = item.dueDate && item.dueDate < new Date() ? dateDiffDays(item.dueDate) : 0;
      return { item, amount, paid, balance, overdueDays };
    })
    .filter((row) => (collectionMode ? row.balance > 0 : true))
    .sort((a, b) => b.overdueDays - a.overdueDays || b.balance - a.balance);
  const overdueRows = rows.filter((row) => row.overdueDays > 0);
  const customerRows = Array.from(
    rows.reduce((map, row) => {
      const key = row.item.customer.companyName;
      const current = map.get(key) ?? { amount: 0, paid: 0, balance: 0, overdue: 0, count: 0 };
      current.amount += row.amount;
      current.paid += row.paid;
      current.balance += row.balance;
      current.overdue += row.overdueDays > 0 ? row.balance : 0;
      current.count += 1;
      map.set(key, current);
      return map;
    }, new Map<string, { amount: number; paid: number; balance: number; overdue: number; count: number }>())
  )
    .map(([customerName, row]) => ({
      客戶: customerName,
      筆數: row.count,
      應收總額: fmtMoney(row.amount),
      已收: fmtMoney(row.paid),
      未收: fmtMoney(row.balance),
      逾期未收: fmtMoney(row.overdue),
    }))
    .sort((a, b) => Number(String(b.未收).replace(/[^0-9.-]/g, "")) - Number(String(a.未收).replace(/[^0-9.-]/g, "")));

  return {
    kind: "receivables-collection",
    title: customer
      ? `${customer.companyName} ${collectionMode ? "應收帳款催收清單" : "應收帳款總覽"}`
      : collectionMode
        ? "客戶應收帳款催收清單"
        : "客戶應收帳款總覽",
    description: collectionMode ? "列出尚未收款的應收帳款，優先排序逾期天數與未收金額。" : "彙整全部客戶應收、已收與未收狀態，可用客戶名稱進一步篩選。",
    cards: [
      { label: "應收總額", value: fmtMoney(rows.reduce((sum, row) => sum + row.amount, 0)) },
      { label: "已收總額", value: fmtMoney(rows.reduce((sum, row) => sum + row.paid, 0)) },
      { label: "待收總額", value: fmtMoney(rows.reduce((sum, row) => sum + row.balance, 0)) },
      { label: "逾期總額", value: fmtMoney(overdueRows.reduce((sum, row) => sum + row.balance, 0)) },
      { label: "涉及客戶", value: `${new Set(rows.map((row) => row.item.customerId)).size} 家` },
    ],
    tables: [
      table("客戶彙總", ["客戶", "筆數", "應收總額", "已收", "未收", "逾期未收"], customerRows),
      table(
        collectionMode ? "催收清單" : "應收明細",
        ["客戶", "銷售單", "到期日", "應收", "已收", "未收", "逾期天數", "聯絡方式", "狀態"],
        rows.map((row) => ({
          客戶: row.item.customer.companyName,
          銷售單: row.item.salesOrder?.number ?? "—",
          到期日: fmtDate(row.item.dueDate),
          應收: fmtMoney(row.amount),
          已收: fmtMoney(row.paid),
          未收: fmtMoney(row.balance),
          逾期天數: row.overdueDays,
          聯絡方式: [row.item.customer.contactName, row.item.customer.phone, row.item.customer.email].filter(Boolean).join(" / ") || "—",
          狀態: STATUS_LABELS[row.item.status] ?? row.item.status,
        }))
      ),
    ],
  };
}

async function loadSalesItemsForPeriod(tenantId: string, period: ReturnType<typeof parsePeriod>) {
  return prisma.salesOrderItem.findMany({
    where: {
      order: {
        tenantId,
        status: { notIn: ["VOIDED", "REJECTED"] },
        ...periodWhere(period, "orderDate"),
      },
    },
    include: {
      product: { select: { id: true, sku: true, name: true, costPrice: true, salePrice: true } },
      order: { select: { orderDate: true, customer: { select: { companyName: true } } } },
    },
  });
}

function aggregateProductSales(items: Awaited<ReturnType<typeof loadSalesItemsForPeriod>>) {
  const map = new Map<string, { sku: string; name: string; quantity: number; revenue: number; cost: number; grossProfit: number }>();
  for (const item of items) {
    const row = map.get(item.productId) ?? {
      sku: item.product.sku,
      name: item.product.name,
      quantity: 0,
      revenue: 0,
      cost: 0,
      grossProfit: 0,
    };
    const quantity = toNumber(item.quantity);
    const revenue = toNumber(item.subtotal);
    const cost = quantity * toNumber(item.product.costPrice);
    row.quantity += quantity;
    row.revenue += revenue;
    row.cost += cost;
    row.grossProfit += revenue - cost;
    map.set(item.productId, row);
  }
  return Array.from(map.values());
}

async function buildProductRanking(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question);
  const items = await loadSalesItemsForPeriod(tenantId, period);
  const rows = aggregateProductSales(items)
    .map((row) => ({ ...row, margin: row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0 }))
    .sort((a, b) => (/毛利/.test(question) ? b.grossProfit - a.grossProfit : b.revenue - a.revenue))
    .slice(0, 50);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const grossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);

  return {
    kind: "product-ranking",
    title: `${period.label}產品毛利/銷售排行`,
    description: "依銷售明細彙總商品數量、銷售額與毛利估算，成本以商品主檔成本計算。",
    cards: [
      { label: "銷售額", value: fmtMoney(totalRevenue) },
      { label: "毛利估算", value: fmtMoney(grossProfit) },
      { label: "平均毛利率", value: fmtPercent(totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0) },
      { label: "上榜品項", value: `${rows.length} 項` },
    ],
    tables: [
      table(
        "產品排行",
        ["排名", "SKU", "商品", "銷售數量", "銷售額", "成本估算", "毛利估算", "毛利率"],
        rows.map((row, index) => ({
          排名: index + 1,
          SKU: row.sku,
          商品: row.name,
          銷售數量: fmtDecimal(row.quantity),
          銷售額: fmtMoney(row.revenue),
          成本估算: fmtMoney(row.cost),
          毛利估算: fmtMoney(row.grossProfit),
          毛利率: fmtPercent(row.margin),
        }))
      ),
    ],
  };
}

async function buildPurchaseSuggestions(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question, "last-30");
  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true },
    include: { stocks: true },
    orderBy: { sku: "asc" },
  });
  const items = await loadSalesItemsForPeriod(tenantId, period);
  const salesQty = new Map<string, number>();
  for (const item of items) salesQty.set(item.productId, (salesQty.get(item.productId) ?? 0) + toNumber(item.quantity));

  const productIds = products.map((product) => product.id);
  const purchaseItems = await prisma.purchaseOrderItem.findMany({
    where: { productId: { in: productIds } },
    include: { order: { include: { supplier: { select: { companyName: true } } } } },
    orderBy: { order: { orderDate: "desc" } },
  });
  const supplierMap = new Map<string, string>();
  for (const item of purchaseItems) {
    if (!supplierMap.has(item.productId)) supplierMap.set(item.productId, item.order.supplier.companyName);
  }

  const rows = products
    .map((product) => {
      const totalStock = product.stocks.reduce((sum, stock) => sum + toNumber(stock.quantity), 0);
      const safetyStock = toNumber(product.safetyStock);
      const recentSales = salesQty.get(product.id) ?? 0;
      const suggestedQty = Math.max(safetyStock - totalStock, recentSales - totalStock, 0);
      return {
        sku: product.sku,
        name: product.name,
        totalStock,
        safetyStock,
        recentSales,
        suggestedQty,
        supplier: supplierMap.get(product.id) ?? "尚無採購紀錄",
      };
    })
    .filter((row) => row.suggestedQty > 0)
    .sort((a, b) => b.suggestedQty - a.suggestedQty)
    .slice(0, 80);

  return {
    kind: "purchase-suggestions",
    title: `${period.label}供應商採購建議`,
    description: "依安全庫存、目前庫存與近期銷售量估算建議採購量，供應商以最近採購紀錄作為參考。",
    cards: [
      { label: "建議採購品項", value: `${rows.length} 項` },
      { label: "建議總量", value: fmtDecimal(rows.reduce((sum, row) => sum + row.suggestedQty, 0)) },
      { label: "低於安全庫存", value: `${rows.filter((row) => row.totalStock < row.safetyStock).length} 項` },
      { label: "統計期間", value: period.label },
    ],
    tables: [
      table(
        "採購建議清單",
        ["SKU", "商品", "目前庫存", "安全庫存", "期間銷售量", "建議採購量", "參考供應商"],
        rows.map((row) => ({
          SKU: row.sku,
          商品: row.name,
          目前庫存: fmtDecimal(row.totalStock),
          安全庫存: fmtDecimal(row.safetyStock),
          期間銷售量: fmtDecimal(row.recentSales),
          建議採購量: fmtDecimal(row.suggestedQty),
          參考供應商: row.supplier,
        }))
      ),
    ],
  };
}

async function buildBomCostAnalysis(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question);
  const product = await findProduct(tenantId, question);
  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true, ...(product ? { id: product.id } : {}) },
    include: { stocks: true },
    orderBy: { sku: "asc" },
  });
  const items = await loadSalesItemsForPeriod(tenantId, period);
  const salesRows = aggregateProductSales(items);
  const salesMap = new Map(salesRows.map((row) => [row.sku, row]));
  const rows = products
    .map((item) => {
      const totalStock = item.stocks.reduce((sum, stock) => sum + toNumber(stock.quantity), 0);
      const costPrice = toNumber(item.costPrice);
      const salePrice = toNumber(item.salePrice);
      const unitProfit = salePrice - costPrice;
      const margin = salePrice > 0 ? (unitProfit / salePrice) * 100 : 0;
      const sales = salesMap.get(item.sku);
      return {
        sku: item.sku,
        name: item.name,
        costPrice,
        salePrice,
        unitProfit,
        margin,
        totalStock,
        stockValue: totalStock * costPrice,
        soldQty: sales?.quantity ?? 0,
        grossProfit: sales?.grossProfit ?? 0,
      };
    })
    .sort((a, b) => b.stockValue - a.stockValue || b.grossProfit - a.grossProfit)
    .slice(0, 80);

  return {
    kind: "bom-cost",
    title: product ? `${product.name} BOM/商品成本分析` : `${period.label}BOM/商品成本分析`,
    description: "目前系統未建立多階用料表，先依商品成本、售價、庫存與銷售估算成本與毛利。",
    cards: [
      { label: "分析品項", value: `${rows.length} 項` },
      { label: "庫存成本", value: fmtMoney(rows.reduce((sum, row) => sum + row.stockValue, 0)) },
      { label: "銷售毛利估算", value: fmtMoney(rows.reduce((sum, row) => sum + row.grossProfit, 0)) },
      { label: "未設定成本", value: `${rows.filter((row) => row.costPrice <= 0).length} 項` },
    ],
    tables: [
      table(
        "成本分析",
        ["SKU", "商品", "成本", "售價", "單位毛利", "毛利率", "目前庫存", "庫存成本", "期間銷售量", "期間毛利"],
        rows.map((row) => ({
          SKU: row.sku,
          商品: row.name,
          成本: fmtMoney(row.costPrice),
          售價: fmtMoney(row.salePrice),
          單位毛利: fmtMoney(row.unitProfit),
          毛利率: fmtPercent(row.margin),
          目前庫存: fmtDecimal(row.totalStock),
          庫存成本: fmtMoney(row.stockValue),
          期間銷售量: fmtDecimal(row.soldQty),
          期間毛利: fmtMoney(row.grossProfit),
        }))
      ),
    ],
  };
}

async function buildOrderAnomalies(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question, "last-30");
  const orders = await prisma.salesOrder.findMany({
    where: {
      tenantId,
      ...periodWhere(period, "orderDate"),
      status: { notIn: ["VOIDED", "REJECTED"] },
    },
    include: { customer: { select: { companyName: true } }, items: true },
    orderBy: { orderDate: "desc" },
  });
  const totals = orders.map((order) => toNumber(order.total));
  const avg = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0;
  const variance = totals.length ? totals.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / totals.length : 0;
  const std = Math.sqrt(variance);
  const highThreshold = avg + Math.max(std * 2, avg * 0.75);

  const rows = orders
    .map((order) => {
      const reasons: string[] = [];
      const total = toNumber(order.total);
      const subtotal = toNumber(order.subtotal);
      const discount = toNumber(order.discount);
      if (total <= 0) reasons.push("金額為 0 或負數");
      if (totals.length >= 5 && total > highThreshold) reasons.push("金額明顯高於近期平均");
      if (subtotal > 0 && discount / subtotal >= 0.3) reasons.push("折扣率超過 30%");
      if (order.status === "DRAFT" && dateDiffDays(order.createdAt) >= 14) reasons.push("草稿超過 14 天");
      if (order.items.length === 0 && total > 0) reasons.push("有金額但無明細");
      if (order.items.some((item) => toNumber(item.quantity) <= 0 || toNumber(item.unitPrice) < 0)) reasons.push("明細數量或單價異常");
      return { order, total, reasons };
    })
    .filter((row) => row.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length || b.total - a.total)
    .slice(0, 80);

  return {
    kind: "order-anomalies",
    title: `${period.label}異常訂單偵測`,
    description: "依金額離群、折扣率、草稿停留時間與明細資料檢查銷售單風險。",
    cards: [
      { label: "異常訂單", value: `${rows.length} 筆` },
      { label: "檢查訂單", value: `${orders.length} 筆` },
      { label: "平均訂單金額", value: fmtMoney(avg) },
      { label: "高金額門檻", value: fmtMoney(highThreshold) },
    ],
    tables: [
      table(
        "異常訂單清單",
        ["日期", "單號", "客戶", "狀態", "總計", "異常原因", "建議處理"],
        rows.map((row) => ({
          日期: fmtDate(row.order.orderDate),
          單號: row.order.number,
          客戶: row.order.customer.companyName,
          狀態: STATUS_LABELS[row.order.status] ?? row.order.status,
          總計: fmtMoney(row.total),
          異常原因: row.reasons.join("、"),
          建議處理: "請複核單價、折扣、明細與審核狀態",
        }))
      ),
    ],
  };
}

async function buildMonthlySummary(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question, "current-month");
  const [salesOrders, purchaseOrders, receivables, products, salesItems] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { tenantId, status: { notIn: ["VOIDED", "REJECTED"] }, ...periodWhere(period, "orderDate") },
      include: { customer: { select: { companyName: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { tenantId, status: { notIn: ["VOIDED", "REJECTED"] }, ...periodWhere(period, "orderDate") },
      include: { supplier: { select: { companyName: true } } },
    }),
    prisma.accountsReceivable.findMany({
      where: { tenantId, status: { notIn: ["VOIDED", "REJECTED"] } },
      include: { customer: { select: { companyName: true } }, salesOrder: { select: { number: true } } },
    }),
    prisma.product.findMany({ where: { tenantId, isActive: true }, include: { stocks: true } }),
    loadSalesItemsForPeriod(tenantId, period),
  ]);
  const salesTotal = salesOrders.reduce((sum, order) => sum + toNumber(order.total), 0);
  const purchaseTotal = purchaseOrders.reduce((sum, order) => sum + toNumber(order.total), 0);
  const productRows = aggregateProductSales(salesItems)
    .map((row) => ({ ...row, margin: row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const grossProfit = productRows.reduce((sum, row) => sum + row.grossProfit, 0);
  const arRows = receivables
    .map((item) => {
      const balance = Math.max(toNumber(item.amount) - toNumber(item.paidAmount), 0);
      const overdueDays = item.dueDate && item.dueDate < new Date() ? dateDiffDays(item.dueDate) : 0;
      return { item, balance, overdueDays };
    })
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays || b.balance - a.balance);
  const lowStockRows = products
    .map((item) => {
      const totalStock = item.stocks.reduce((sum, stock) => sum + toNumber(stock.quantity), 0);
      const safetyStock = toNumber(item.safetyStock);
      return { sku: item.sku, name: item.name, totalStock, safetyStock, shortage: Math.max(safetyStock - totalStock, 0) };
    })
    .filter((row) => row.shortage > 0 || row.totalStock <= 0)
    .sort((a, b) => b.shortage - a.shortage)
    .slice(0, 10);
  const statusMap = new Map<string, { count: number; total: number }>();
  for (const order of salesOrders) {
    const row = statusMap.get(order.status) ?? { count: 0, total: 0 };
    row.count += 1;
    row.total += toNumber(order.total);
    statusMap.set(order.status, row);
  }

  return {
    kind: "monthly-summary",
    title: `${period.label}營運摘要`,
    description: "彙整銷售、採購、毛利估算、應收帳款與庫存警示，可直接寄送給主管或老闆。",
    cards: [
      { label: "銷售總額", value: fmtMoney(salesTotal) },
      { label: "採購總額", value: fmtMoney(purchaseTotal) },
      { label: "毛利估算", value: fmtMoney(grossProfit) },
      { label: "應收未收", value: fmtMoney(arRows.reduce((sum, row) => sum + row.balance, 0)) },
      { label: "庫存警示", value: `${lowStockRows.length} 項` },
    ],
    tables: [
      table(
        "銷售狀態",
        ["狀態", "筆數", "金額"],
        Array.from(statusMap.entries())
          .map(([status, row]) => ({ 狀態: STATUS_LABELS[status] ?? status, 筆數: row.count, 金額: fmtMoney(row.total) }))
          .sort((a, b) => Number(b.筆數) - Number(a.筆數))
      ),
      table(
        "Top 10 商品",
        ["排名", "SKU", "商品", "銷售數量", "銷售額", "毛利估算", "毛利率"],
        productRows.slice(0, 10).map((row, index) => ({
          排名: index + 1,
          SKU: row.sku,
          商品: row.name,
          銷售數量: fmtDecimal(row.quantity),
          銷售額: fmtMoney(row.revenue),
          毛利估算: fmtMoney(row.grossProfit),
          毛利率: fmtPercent(row.margin),
        }))
      ),
      table(
        "應收催收優先清單",
        ["客戶", "銷售單", "到期日", "未收金額", "逾期天數"],
        arRows.slice(0, 10).map((row) => ({
          客戶: row.item.customer.companyName,
          銷售單: row.item.salesOrder?.number ?? "—",
          到期日: fmtDate(row.item.dueDate),
          未收金額: fmtMoney(row.balance),
          逾期天數: row.overdueDays,
        }))
      ),
      table(
        "庫存警示 Top 10",
        ["SKU", "商品", "目前庫存", "安全庫存", "缺口"],
        lowStockRows.map((row) => ({
          SKU: row.sku,
          商品: row.name,
          目前庫存: fmtDecimal(row.totalStock),
          安全庫存: fmtDecimal(row.safetyStock),
          缺口: fmtDecimal(row.shortage),
        }))
      ),
    ],
  };
}

function accountSideLabel(type: string) {
  return ["ASSET", "COST", "EXPENSE"].includes(type) ? "借方" : "貸方";
}

function hasAccountKeyword(lines: Array<{ account: { name: string; type: string }; debit: unknown; credit: unknown }>, side: "debit" | "credit", keyword: RegExp) {
  return lines.some((line) => {
    const amount = side === "debit" ? toNumber(line.debit) : toNumber(line.credit);
    return amount > 0 && keyword.test(line.account.name);
  });
}

async function buildJournalAccountReview(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question, "last-30");
  const entries = await prisma.journalEntry.findMany({
    where: {
      tenantId,
      status: { notIn: ["VOIDED", "REJECTED"] },
      ...periodWhere(period, "entryDate"),
    },
    include: { lines: { include: { account: true } } },
    orderBy: { entryDate: "desc" },
    take: 250,
  });

  const issueRows: Array<Record<string, TableValue>> = [];
  let unbalancedCount = 0;
  let accountDirectionCount = 0;
  let keywordRuleCount = 0;

  for (const entry of entries) {
    const totalDebit = entry.lines.reduce((sum, line) => sum + toNumber(line.debit), 0);
    const totalCredit = entry.lines.reduce((sum, line) => sum + toNumber(line.credit), 0);
    const summaryText = `${entry.summary} ${entry.lines.map((line) => line.memo ?? "").join(" ")}`;

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      unbalancedCount += 1;
      issueRows.push({
        日期: fmtDate(entry.entryDate),
        傳票號: entry.number,
        摘要: entry.summary,
        異常類型: "借貸不平",
        科目分錄: "整張傳票",
        金額: `${fmtMoney(totalDebit)} / ${fmtMoney(totalCredit)}`,
        建議: "請先調整借貸總額相等，再檢查各分錄科目。",
      });
    }

    for (const line of entry.lines) {
      const debit = toNumber(line.debit);
      const credit = toNumber(line.credit);
      if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) {
        issueRows.push({
          日期: fmtDate(entry.entryDate),
          傳票號: entry.number,
          摘要: entry.summary,
          異常類型: debit > 0 && credit > 0 ? "同列同時借貸" : "分錄金額為 0",
          科目分錄: `${line.account.code} ${line.account.name}`,
          金額: `${fmtMoney(debit)} / ${fmtMoney(credit)}`,
          建議: "同一列分錄應只填借方或貸方其中一邊。",
        });
      }

      const normalSide = accountSideLabel(line.account.type);
      const onUnusualSide =
        (normalSide === "借方" && credit > 0 && debit === 0) ||
        (normalSide === "貸方" && debit > 0 && credit === 0);
      if (onUnusualSide && Math.max(debit, credit) >= 100000) {
        accountDirectionCount += 1;
        issueRows.push({
          日期: fmtDate(entry.entryDate),
          傳票號: entry.number,
          摘要: entry.summary,
          異常類型: "大額科目方向需複核",
          科目分錄: `${line.account.code} ${line.account.name}`,
          金額: fmtMoney(Math.max(debit, credit)),
          建議: `${line.account.name} 通常偏${normalSide}餘額，請確認本筆是否為沖銷、調整或退回交易。`,
        });
      }
    }

    if (/銷售|營收|收入|開立發票|發票/.test(summaryText)) {
      const hasRevenueCredit = entry.lines.some((line) => line.account.type === "REVENUE" && toNumber(line.credit) > 0);
      const hasAssetDebit = entry.lines.some((line) => line.account.type === "ASSET" && toNumber(line.debit) > 0);
      if (!hasRevenueCredit || !hasAssetDebit) {
        keywordRuleCount += 1;
        issueRows.push({
          日期: fmtDate(entry.entryDate),
          傳票號: entry.number,
          摘要: entry.summary,
          異常類型: "銷售摘要科目不足",
          科目分錄: entry.lines.map((line) => `${line.account.code} ${line.account.name}`).join("、"),
          金額: fmtMoney(Math.max(totalDebit, totalCredit)),
          建議: "銷售/發票相關傳票通常需要借記應收或現金銀行，並貸記收入與稅額科目。",
        });
      }
    }

    if (/採購|進貨|費用|成本/.test(summaryText)) {
      const hasDebitCostOrAsset = entry.lines.some((line) => ["COST", "EXPENSE", "ASSET"].includes(line.account.type) && toNumber(line.debit) > 0);
      if (!hasDebitCostOrAsset) {
        keywordRuleCount += 1;
        issueRows.push({
          日期: fmtDate(entry.entryDate),
          傳票號: entry.number,
          摘要: entry.summary,
          異常類型: "採購/費用摘要科目不足",
          科目分錄: entry.lines.map((line) => `${line.account.code} ${line.account.name}`).join("、"),
          金額: fmtMoney(Math.max(totalDebit, totalCredit)),
          建議: "採購、進貨或費用通常需要借記存貨、成本或費用類科目，請確認切帳科目。",
        });
      }
    }

    if (/薪資|薪水|工資| payroll/i.test(summaryText) && !hasAccountKeyword(entry.lines, "debit", /薪|工資|費用|salary|payroll/i)) {
      keywordRuleCount += 1;
      issueRows.push({
        日期: fmtDate(entry.entryDate),
        傳票號: entry.number,
        摘要: entry.summary,
        異常類型: "薪資摘要未見薪資費用",
        科目分錄: entry.lines.map((line) => `${line.account.code} ${line.account.name}`).join("、"),
        金額: fmtMoney(Math.max(totalDebit, totalCredit)),
        建議: "薪資相關傳票通常需借記薪資或人事費用，並貸記現金銀行或應付薪資。",
      });
    }
  }

  return {
    kind: "journal-account-review",
    title: `${period.label}傳票科目異常檢查`,
    description: "依借貸平衡、科目方向、摘要關鍵字與常見會計規則檢查傳票，結果為複核建議。",
    cards: [
      { label: "檢查傳票", value: `${entries.length} 筆` },
      { label: "異常建議", value: `${issueRows.length} 筆` },
      { label: "借貸不平", value: `${unbalancedCount} 筆` },
      { label: "科目/摘要規則", value: `${accountDirectionCount + keywordRuleCount} 筆` },
    ],
    tables: [
      table("傳票異常清單", ["日期", "傳票號", "摘要", "異常類型", "科目分錄", "金額", "建議"], issueRows.slice(0, 120)),
    ],
  };
}

async function buildFinancialAnomalies(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question, /本月|月報/.test(question) ? "current-month" : "all");
  const accounts = await prisma.chartOfAccount.findMany({
    where: { tenantId },
    include: {
      lines: {
        where: { entry: { tenantId, status: "POSTED", ...periodWhere(period, "entryDate") } },
        include: { entry: true },
      },
    },
    orderBy: { code: "asc" },
  });
  const receivables = await prisma.accountsReceivable.findMany({ where: { tenantId, status: { notIn: ["VOIDED", "REJECTED"] } } });
  const payables = await prisma.accountsPayable.findMany({ where: { tenantId, status: { notIn: ["VOIDED", "REJECTED"] } } });
  const stocks = await prisma.inventoryStock.findMany({ where: { tenantId }, include: { product: true } });

  let totalDebit = 0;
  let totalCredit = 0;
  const trial = accounts.map((account) => {
    const debit = account.lines.reduce((sum, line) => sum + toNumber(line.debit), 0);
    const credit = account.lines.reduce((sum, line) => sum + toNumber(line.credit), 0);
    totalDebit += debit;
    totalCredit += credit;
    const opening = toNumber(account.openingBalance);
    const debitPos = ["ASSET", "COST", "EXPENSE"].includes(account.type);
    const balance = opening + (debitPos ? debit - credit : credit - debit);
    return { account, debit, credit, balance };
  });

  const revenue = trial.filter((row) => row.account.type === "REVENUE").reduce((sum, row) => sum + row.balance, 0);
  const cost = trial.filter((row) => row.account.type === "COST").reduce((sum, row) => sum + row.balance, 0);
  const expense = trial.filter((row) => row.account.type === "EXPENSE").reduce((sum, row) => sum + row.balance, 0);
  const netIncome = revenue - cost - expense;
  const asset = trial.filter((row) => row.account.type === "ASSET").reduce((sum, row) => sum + row.balance, 0);
  const liability = trial.filter((row) => row.account.type === "LIABILITY").reduce((sum, row) => sum + row.balance, 0);
  const equity = trial.filter((row) => row.account.type === "EQUITY").reduce((sum, row) => sum + row.balance, 0) + netIncome;
  const balanceDiff = asset - liability - equity;
  const arBalance = receivables.reduce((sum, item) => sum + Math.max(toNumber(item.amount) - toNumber(item.paidAmount), 0), 0);
  const apBalance = payables.reduce((sum, item) => sum + Math.max(toNumber(item.amount) - toNumber(item.paidAmount), 0), 0);
  const inventoryValue = stocks.reduce((sum, stock) => sum + toNumber(stock.quantity) * toNumber(stock.product.costPrice), 0);

  const issues: Array<Record<string, TableValue>> = [];
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    issues.push({ 項目: "試算表借貸不平", 數值: `${fmtMoney(totalDebit)} / ${fmtMoney(totalCredit)}`, 風險: "高", 建議: "先檢查已過帳傳票是否有借貸不平或資料匯入異常。" });
  }
  if (Math.abs(balanceDiff) > 1) {
    issues.push({ 項目: "資產負債表不平衡", 數值: fmtMoney(balanceDiff), 風險: "高", 建議: "檢查期初餘額、權益科目與本期損益結轉是否完整。" });
  }
  if (revenue > 0 && cost > revenue) {
    issues.push({ 項目: "銷貨成本高於收入", 數值: `成本 ${fmtMoney(cost)} / 收入 ${fmtMoney(revenue)}`, 風險: "中", 建議: "檢查成本科目切帳、商品成本設定與退貨/折讓是否正確。" });
  }
  if (revenue > 0 && expense / revenue > 0.8) {
    issues.push({ 項目: "費用占收入過高", 數值: fmtPercent((expense / revenue) * 100), 風險: "中", 建議: "檢查費用分類是否誤切至本期，或是否有一次性大額費用。" });
  }
  if (netIncome < 0) {
    issues.push({ 項目: "本期虧損", 數值: fmtMoney(netIncome), 風險: "中", 建議: "檢視毛利、費用與低毛利商品，並確認收入是否已完整入帳。" });
  }
  for (const row of trial) {
    if (row.account.type === "ASSET" && row.balance < 0 && /現金|銀行|存貨|應收|cash|bank|inventory/i.test(row.account.name)) {
      issues.push({ 項目: `資產科目負數：${row.account.code} ${row.account.name}`, 數值: fmtMoney(row.balance), 風險: "中", 建議: "檢查付款、沖帳、庫存成本或期初餘額是否方向錯誤。" });
    }
  }
  if (arBalance > revenue && revenue > 0) {
    issues.push({ 項目: "應收未收高於期間收入", 數值: fmtMoney(arBalance), 風險: "中", 建議: "優先產生催收清單，檢查是否有長期未收款客戶。" });
  }

  return {
    kind: "financial-anomalies",
    title: `${period.label}帳務財報異常分析`,
    description: "依已過帳傳票、試算表、損益與資產負債關係檢查財報風險並給予建議。",
    cards: [
      { label: "收入", value: fmtMoney(revenue) },
      { label: "淨利", value: fmtMoney(netIncome) },
      { label: "資產負債差額", value: fmtMoney(balanceDiff) },
      { label: "異常建議", value: `${issues.length} 項` },
    ],
    tables: [
      table("財報異常與建議", ["項目", "數值", "風險", "建議"], issues),
      table(
        "財務摘要",
        ["項目", "金額"],
        [
          { 項目: "收入", 金額: fmtMoney(revenue) },
          { 項目: "銷貨成本", 金額: fmtMoney(cost) },
          { 項目: "費用", 金額: fmtMoney(expense) },
          { 項目: "淨利", 金額: fmtMoney(netIncome) },
          { 項目: "資產", 金額: fmtMoney(asset) },
          { 項目: "負債", 金額: fmtMoney(liability) },
          { 項目: "權益含本期損益", 金額: fmtMoney(equity) },
          { 項目: "應收未收", 金額: fmtMoney(arBalance) },
          { 項目: "應付未付", 金額: fmtMoney(apBalance) },
          { 項目: "庫存成本", 金額: fmtMoney(inventoryValue) },
        ]
      ),
    ],
  };
}

async function buildPriceVarianceReport(tenantId: string, question: string): Promise<ReportResult> {
  const period = parsePeriod(question);
  const product = await findProduct(tenantId, question);
  const items = await prisma.salesOrderItem.findMany({
    where: {
      ...(product ? { productId: product.id } : {}),
      order: { tenantId, status: { notIn: ["VOIDED", "REJECTED"] }, ...periodWhere(period, "orderDate") },
    },
    include: {
      product: { select: { sku: true, name: true, salePrice: true } },
      order: { select: { number: true, orderDate: true, customer: { select: { companyName: true } } } },
    },
    orderBy: { order: { orderDate: "desc" } },
    take: 2000,
  });

  const groups = new Map<string, typeof items>();
  for (const item of items) groups.set(item.productId, [...(groups.get(item.productId) ?? []), item]);
  const rows = Array.from(groups.values())
    .map((group) => {
      const prices = group.map((item) => toNumber(item.unitPrice)).filter((price) => price > 0);
      const uniquePrices = Array.from(new Set(prices.map((price) => price.toFixed(4))));
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const latest = group[0];
      const latestPrice = toNumber(latest.unitPrice);
      const varianceRate = min > 0 ? ((max - min) / min) * 100 : 0;
      return { group, uniquePrices, min, max, latest, latestPrice, varianceRate };
    })
    .filter((row) => row.uniquePrices.length > 1)
    .sort((a, b) => b.varianceRate - a.varianceRate)
    .slice(0, 80);

  const detailRows = rows.flatMap((row) =>
    row.group.slice(0, 5).map((item) => ({
      日期: fmtDate(item.order.orderDate),
      單號: item.order.number,
      客戶: item.order.customer.companyName,
      SKU: item.product.sku,
      商品: item.product.name,
      單價: fmtMoney(toNumber(item.unitPrice)),
      數量: fmtDecimal(toNumber(item.quantity)),
    }))
  );

  return {
    kind: "price-variance",
    title: product ? `${product.name} 歷史銷售單價差異` : `${period.label}商品歷史銷售單價差異`,
    description: "比對銷售明細中的商品單價，找出同一商品曾使用不同銷售單價的品項。",
    cards: [
      { label: "異動品項", value: `${rows.length} 項` },
      { label: "檢查明細", value: `${items.length} 筆` },
      { label: "最大差異率", value: fmtPercent(rows[0]?.varianceRate ?? 0) },
      { label: "統計期間", value: period.label },
    ],
    tables: [
      table(
        "商品單價差異",
        ["SKU", "商品", "最近單價", "最低單價", "最高單價", "差異率", "最近單號", "最近客戶", "建議"],
        rows.map((row) => ({
          SKU: row.latest.product.sku,
          商品: row.latest.product.name,
          最近單價: fmtMoney(row.latestPrice),
          最低單價: fmtMoney(row.min),
          最高單價: fmtMoney(row.max),
          差異率: fmtPercent(row.varianceRate),
          最近單號: row.latest.order.number,
          最近客戶: row.latest.order.customer.companyName,
          建議: row.varianceRate >= 20 ? "差異較大，請確認報價、折扣或客戶合約價。" : "請確認是否為正常客戶別價格。",
        }))
      ),
      table("最近單價明細", ["日期", "單號", "客戶", "SKU", "商品", "單價", "數量"], detailRows),
    ],
  };
}

export async function runAssistantQuery(tenantId: string, question: string): Promise<AssistantResult> {
  const text = String(question ?? "").trim();
  if (!text) throw new Error("請輸入想查詢的問題。");

  if (/傳票|分錄|切帳|切科目|科目.*正確|會計科目/i.test(text)) return buildJournalAccountReview(tenantId, text);
  if (/財報|財務報表|帳務|資產負債|損益|試算表|會計異常/i.test(text)) return buildFinancialAnomalies(tenantId, text);
  if (/單價|價格異動|價格差異|歷史價格|售價不同|之前不同/i.test(text)) return buildPriceVarianceReport(tenantId, text);
  if (/營運摘要|月報|老闆|主管摘要|經營摘要/i.test(text)) return buildMonthlySummary(tenantId, text);
  if (/異常|風險|偵測|離群|審核/i.test(text)) return buildOrderAnomalies(tenantId, text);
  if (/bom|BOM|成本分析|商品成本|庫存成本/i.test(text)) return buildBomCostAnalysis(tenantId, text);
  if (/採購建議|補貨|請購|供應商|缺貨/i.test(text)) return buildPurchaseSuggestions(tenantId, text);
  if (/毛利|排行|排名|top|熱賣|銷售排行/i.test(text)) return buildProductRanking(tenantId, text);
  if (/應收|催收|逾期|收款|未收/i.test(text)) return buildReceivablesCollection(tenantId, text);
  if (/庫存低|安全量|安全庫存|庫存警示|低於安全|零庫存/i.test(text)) return buildInventoryAlerts(tenantId, text);
  if (/銷售|業績|營收|sales|sale/i.test(text)) return buildSalesReport(tenantId, text);

  return emptyHelp();
}

export function buildAssistantHtmlReport(result: ReportResult) {
  const cards = result.cards
    .map((card) => `<div class="card"><div class="label">${escapeHtml(card.label)}</div><div class="value">${escapeHtml(card.value)}</div></div>`)
    .join("");
  const tables = result.tables
    .map((item) => {
      const head = item.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
      const rows = item.rows
        .map((row) => `<tr>${item.columns.map((column) => `<td>${escapeHtml(row[column] ?? "")}</td>`).join("")}</tr>`)
        .join("");
      return `<h2>${escapeHtml(item.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${item.columns.length}">查無資料</td></tr>`}</tbody></table>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, "Noto Sans TC", sans-serif; color: #111827; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 24px; }
    p { color: #4b5563; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .card { border: 1px solid #d1d5db; padding: 10px; }
    .label { color: #6b7280; font-size: 12px; }
    .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(result.title)}</h1>
  <p>${escapeHtml(result.description)}</p>
  <p>產生時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}</p>
  <div class="cards">${cards}</div>
  ${tables}
</body>
</html>`;
}

export function buildAssistantExcelBuffer(result: ReportResult) {
  const wb = XLSX.utils.book_new();
  const overview = [
    { 項目: "標題", 值: result.title },
    { 項目: "說明", 值: result.description },
    ...result.cards.map((card) => ({ 項目: card.label, 值: card.value })),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), "摘要");
  for (const item of result.tables) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(item.rows), item.title.slice(0, 31));
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
