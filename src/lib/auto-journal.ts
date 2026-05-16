/**
 * 自動分錄產生器
 *
 * 依據業務事件自動產生會計分錄草稿（DRAFT 狀態），
 * 使用者可在傳票介面審核、調整後過帳 (POSTED)。
 *
 * 標準科目對應（台灣中小企業）：
 *   1103 銀行存款       1131 應收票據     1132 應收帳款
 *   1151 進項稅額       1201 存貨
 *   2102 應付票據       2103 應付帳款     2111 銷項稅額
 *   4101 銷貨收入       4151 銷貨退回     4152 銷貨折讓
 *   5101 銷貨成本       5201 進貨        5301 進貨退出     5302 進貨折讓
 */
import { prisma } from "./prisma";

// ─────────── 預設科目對應 ───────────
export const DEFAULT_ACCOUNT_CODES = {
  CASH: "1101",
  BANK: "1103",
  AR: "1132", // 應收帳款
  AR_NOTE: "1131", // 應收票據
  AP: "2103", // 應付帳款
  AP_NOTE: "2102", // 應付票據
  INVENTORY: "1201",
  INPUT_TAX: "1151",
  OUTPUT_TAX: "2111",
  SALES_REVENUE: "4101",
  SALES_RETURN: "4151",
  SALES_DISCOUNT: "4152",
  COGS: "5101",
  PURCHASE: "5201",
  PURCHASE_RETURN: "5301",
  PURCHASE_DISCOUNT: "5302",
} as const;

export type AccountCodeKey = keyof typeof DEFAULT_ACCOUNT_CODES;

/** 取得科目 ID（依代碼） */
async function getAccount(code: string) {
  const a = await prisma.chartOfAccount.findUnique({ where: { code } });
  if (!a) throw new Error(`找不到會計科目 ${code}，請先建立`);
  return a;
}

export type DraftLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo?: string;
};

export type DraftEntry = {
  sourceType: string;
  sourceId: string;
  summary: string;
  entryDate: string;
  lines: DraftLine[];
};

/** 工具：建立分錄行 */
async function line(code: string, debit: number, credit: number, memo?: string): Promise<DraftLine> {
  const acc = await getAccount(code);
  return {
    accountId: acc.id,
    accountCode: acc.code,
    accountName: acc.name,
    debit: +debit.toFixed(2),
    credit: +credit.toFixed(2),
    memo,
  };
}

/* ============================================================ */
/*               採購單進貨 (RECEIVED)                            */
/* ============================================================ */
export async function buildPurchaseReceiveDraft(purchaseOrderId: string): Promise<DraftEntry> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { supplier: true, items: true },
  });
  if (!po) throw new Error("找不到採購單");

  const subtotal = Number(po.subtotal) - Number(po.discount);
  const tax = Number(po.taxAmount);
  const total = Number(po.total);

  const lines: DraftLine[] = [
    await line(DEFAULT_ACCOUNT_CODES.INVENTORY, subtotal, 0, `進貨 ${po.number}`),
    ...(tax > 0 ? [await line(DEFAULT_ACCOUNT_CODES.INPUT_TAX, tax, 0, "進項稅額 5%")] : []),
    await line(DEFAULT_ACCOUNT_CODES.AP, 0, total, `${po.supplier.companyName}`),
  ];

  return {
    sourceType: "PURCHASE",
    sourceId: po.id,
    summary: `採購進貨 ${po.number} ${po.supplier.companyName}`,
    entryDate: (po.receivedAt ?? po.createdAt).toISOString().slice(0, 10),
    lines,
  };
}

/* ============================================================ */
/*               銷售開票 (INVOICED)                              */
/* ============================================================ */
export async function buildSalesInvoiceDraft(salesOrderId: string): Promise<DraftEntry> {
  const so = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { customer: true, items: { include: { product: true } } },
  });
  if (!so) throw new Error("找不到銷售單");

  const subtotal = Number(so.subtotal) - Number(so.discount);
  const tax = Number(so.taxAmount);
  const total = Number(so.total);

  // 銷貨成本（依商品 costPrice 估算）
  const cogs = so.items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.product.costPrice ?? 0), 0);

  const lines: DraftLine[] = [
    await line(DEFAULT_ACCOUNT_CODES.AR, total, 0, `${so.customer.companyName}`),
    await line(DEFAULT_ACCOUNT_CODES.SALES_REVENUE, 0, subtotal, `銷售 ${so.number}`),
    ...(tax > 0 ? [await line(DEFAULT_ACCOUNT_CODES.OUTPUT_TAX, 0, tax, "銷項稅額 5%")] : []),
  ];

  if (cogs > 0) {
    lines.push(
      await line(DEFAULT_ACCOUNT_CODES.COGS, cogs, 0, `銷貨成本 ${so.number}`),
      await line(DEFAULT_ACCOUNT_CODES.INVENTORY, 0, cogs, "結轉存貨")
    );
  }

  return {
    sourceType: "SALES",
    sourceId: so.id,
    summary: `銷售開票 ${so.number} ${so.customer.companyName}`,
    entryDate: new Date().toISOString().slice(0, 10),
    lines,
  };
}

/* ============================================================ */
/*               進貨退出                                          */
/* ============================================================ */
export async function buildPurchaseReturnDraft(returnId: string): Promise<DraftEntry> {
  const pr = await prisma.purchaseReturn.findUnique({
    where: { id: returnId },
    include: { supplier: true, items: true, purchaseOrder: true },
  });
  if (!pr) throw new Error("找不到進貨退出單");

  const total = Number(pr.total);
  const subtotal = +(total / 1.05).toFixed(2);
  const tax = +(total - subtotal).toFixed(2);

  const lines: DraftLine[] = [
    await line(DEFAULT_ACCOUNT_CODES.AP, total, 0, `沖回應付`),
    await line(DEFAULT_ACCOUNT_CODES.PURCHASE_RETURN, 0, subtotal, `${pr.supplier.companyName} 退貨`),
    ...(tax > 0 ? [await line(DEFAULT_ACCOUNT_CODES.INPUT_TAX, 0, tax, "進項稅額轉出")] : []),
  ];

  return {
    sourceType: "PURCHASE_RETURN",
    sourceId: pr.id,
    summary: `進貨退出 ${pr.number} ${pr.supplier.companyName}`,
    entryDate: ((pr as any).returnDate ?? pr.createdAt).toISOString().slice(0, 10),
    lines,
  };
}

/* ============================================================ */
/*               銷貨退回                                          */
/* ============================================================ */
export async function buildSalesReturnDraft(returnId: string): Promise<DraftEntry> {
  const sr = await prisma.salesReturn.findUnique({
    where: { id: returnId },
    include: { customer: true, items: true, salesOrder: true },
  });
  if (!sr) throw new Error("找不到銷貨退回單");

  const total = Number(sr.total);
  const subtotal = +(total / 1.05).toFixed(2);
  const tax = +(total - subtotal).toFixed(2);

  const lines: DraftLine[] = [
    await line(DEFAULT_ACCOUNT_CODES.SALES_RETURN, subtotal, 0, `${sr.customer.companyName} 退回`),
    ...(tax > 0 ? [await line(DEFAULT_ACCOUNT_CODES.OUTPUT_TAX, tax, 0, "銷項稅額沖回")] : []),
    await line(DEFAULT_ACCOUNT_CODES.AR, 0, total, "沖回應收"),
  ];

  return {
    sourceType: "SALES_RETURN",
    sourceId: sr.id,
    summary: `銷貨退回 ${sr.number} ${sr.customer.companyName}`,
    entryDate: ((sr as any).returnDate ?? sr.createdAt).toISOString().slice(0, 10),
    lines,
  };
}

/* ============================================================ */
/*               收款                                               */
/* ============================================================ */
export async function buildReceivePaymentDraft(receivePaymentId: string): Promise<DraftEntry> {
  const rp = await prisma.receivePayment.findUnique({
    where: { id: receivePaymentId },
    include: { customer: true, receivable: true },
  });
  if (!rp) throw new Error("找不到收款單");

  const amount = Number(rp.amount);
  // method: CASH / BANK / CHECK / OTHER
  const debitCode =
    rp.method === "CASH" ? DEFAULT_ACCOUNT_CODES.CASH :
    rp.method === "CHECK" ? DEFAULT_ACCOUNT_CODES.AR_NOTE :
    DEFAULT_ACCOUNT_CODES.BANK;

  const lines: DraftLine[] = [
    await line(debitCode, amount, 0, `收款 ${rp.number}`),
    await line(DEFAULT_ACCOUNT_CODES.AR, 0, amount, `${rp.customer.companyName}`),
  ];

  return {
    sourceType: "RECEIVE_PAYMENT",
    sourceId: rp.id,
    summary: `收款 ${rp.number} ${rp.customer.companyName}`,
    entryDate: rp.createdAt.toISOString().slice(0, 10),
    lines,
  };
}

/* ============================================================ */
/*               付款                                               */
/* ============================================================ */
export async function buildSupplierPaymentDraft(supplierPaymentId: string): Promise<DraftEntry> {
  const sp = await prisma.supplierPayment.findUnique({
    where: { id: supplierPaymentId },
    include: { supplier: true, payable: true },
  });
  if (!sp) throw new Error("找不到付款單");

  const amount = Number(sp.amount);
  const creditCode =
    sp.method === "CASH" ? DEFAULT_ACCOUNT_CODES.CASH :
    sp.method === "CHECK" ? DEFAULT_ACCOUNT_CODES.AP_NOTE :
    DEFAULT_ACCOUNT_CODES.BANK;

  const lines: DraftLine[] = [
    await line(DEFAULT_ACCOUNT_CODES.AP, amount, 0, `${sp.supplier.companyName}`),
    await line(creditCode, 0, amount, `付款 ${sp.number}`),
  ];

  return {
    sourceType: "SUPPLIER_PAYMENT",
    sourceId: sp.id,
    summary: `付款 ${sp.number} ${sp.supplier.companyName}`,
    entryDate: sp.createdAt.toISOString().slice(0, 10),
    lines,
  };
}

/* ============================================================ */
/*               薪資 (依期間彙總)                                 */
/* ============================================================ */
export async function buildPayrollPeriodDraft(periodId: string): Promise<DraftEntry> {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { payrolls: { include: { items: true } } },
  });
  if (!period) throw new Error("找不到薪資期間");

  let totalEarnings = 0;
  let totalDeductionLI = 0;
  let totalDeductionNHI = 0;
  let totalDeductionTax = 0;
  let totalDeductionOther = 0;
  let totalEmployerLI = 0;
  let totalEmployerNHI = 0;
  let totalEmployerPension = 0;
  let totalNetPay = 0;

  for (const p of period.payrolls) {
    if (p.status === "VOID") continue;
    totalEarnings += Number(p.earnings);
    totalNetPay += Number(p.netPay);
    for (const item of p.items) {
      const amt = Number(item.amount);
      if (item.type === "DEDUCTION") {
        if (item.code === "LI") totalDeductionLI += amt;
        else if (item.code === "NHI") totalDeductionNHI += amt;
        else if (item.code === "TAX") totalDeductionTax += amt;
        else totalDeductionOther += amt;
      } else if (item.type === "EMPLOYER") {
        if (item.code === "LI_ER") totalEmployerLI += amt;
        else if (item.code === "NHI_ER") totalEmployerNHI += amt;
        else if (item.code === "PENSION_ER") totalEmployerPension += amt;
      }
    }
  }

  // 使用既有科目: 6101 薪資費用、6104 勞健保費、6105 退休金、2104 應付薪資、2114 代扣勞健保、2113 代扣所得稅
  const lines: DraftLine[] = [];
  // 借方
  if (totalEarnings > 0) lines.push(await line("6101", totalEarnings, 0, "薪資費用"));
  if (totalEmployerLI + totalEmployerNHI > 0) lines.push(await line("6104", totalEmployerLI + totalEmployerNHI, 0, "勞健保費(雇主)"));
  if (totalEmployerPension > 0) lines.push(await line("6105", totalEmployerPension, 0, "退休金"));
  // 貸方
  const totalLINHI = totalDeductionLI + totalDeductionNHI + totalEmployerLI + totalEmployerNHI + totalEmployerPension;
  if (totalLINHI > 0) lines.push(await line("2114", 0, totalLINHI, "代扣勞健保/勞退"));
  if (totalDeductionTax > 0) lines.push(await line("2113", 0, totalDeductionTax, "代扣所得稅"));
  if (totalDeductionOther > 0) lines.push(await line("2131", 0, totalDeductionOther, "其他應付款"));
  if (totalNetPay > 0) lines.push(await line("2104", 0, totalNetPay, "應付薪資"));

  return {
    sourceType: "PAYROLL_PERIOD",
    sourceId: period.id,
    summary: `${period.year}/${String(period.month).padStart(2, "0")} 月薪資結算`,
    entryDate: (period.payDate ?? period.periodEnd).toISOString().slice(0, 10),
    lines,
  };
}

/* ============================================================ */
/*               發票                                               */
/* ============================================================ */
export async function buildInvoiceDraft(invoiceId: string): Promise<DraftEntry> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: true, supplier: true },
  });
  if (!inv) throw new Error("找不到發票");

  const exTax = Number(inv.amountExTax);
  const tax = Number(inv.taxAmount);
  const total = Number(inv.totalAmount);
  const isSales = inv.type === "SALES";

  const lines: DraftLine[] = isSales
    ? [
        await line(DEFAULT_ACCOUNT_CODES.AR, total, 0, `${inv.customer?.companyName ?? ""}`),
        await line(DEFAULT_ACCOUNT_CODES.SALES_REVENUE, 0, exTax, `銷售 ${inv.number}`),
        ...(tax > 0 ? [await line(DEFAULT_ACCOUNT_CODES.OUTPUT_TAX, 0, tax, "銷項稅額")] : []),
      ]
    : [
        await line(DEFAULT_ACCOUNT_CODES.PURCHASE, exTax, 0, `進貨 ${inv.number}`),
        ...(tax > 0 ? [await line(DEFAULT_ACCOUNT_CODES.INPUT_TAX, tax, 0, "進項稅額")] : []),
        await line(DEFAULT_ACCOUNT_CODES.AP, 0, total, `${inv.supplier?.companyName ?? ""}`),
      ];

  return {
    sourceType: "INVOICE",
    sourceId: inv.id,
    summary: `${isSales ? "銷項" : "進項"}發票 ${inv.number}`,
    entryDate: inv.invoiceDate.toISOString().slice(0, 10),
    lines,
  };
}
