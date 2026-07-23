import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content);
}

function replaceOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) throw new Error(`找不到要修改的區塊：${label}`);
  return source.replace(oldText, newText);
}

function replaceRegex(source, pattern, replacement, marker, label) {
  if (source.includes(marker)) return source;
  if (!pattern.test(source)) throw new Error(`找不到要修改的區塊：${label}`);
  return source.replace(pattern, replacement);
}

const fulfillmentPath = "src/lib/pos-fulfillment.ts";
const fulfillment = `import { Prisma } from "@prisma/client";
import { lockAndAssertAccountingPeriodOpen } from "@/lib/accounting-controls";
import { nextNumbersFastInTransaction } from "@/lib/number-sequence";
import { prisma } from "@/lib/prisma";

type CheckoutJournalLine = { code: string; debit?: number; credit?: number; memo: string };

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function createCheckoutJournal(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; userId: string; journalNumber: string; saleNumber: string; lines: CheckoutJournalLine[] },
) {
  const entryDate = new Date();
  await lockAndAssertAccountingPeriodOpen(tx, input.tenantId, entryDate);
  const lines = input.lines.filter((line) => roundMoney(line.debit ?? 0) !== 0 || roundMoney(line.credit ?? 0) !== 0);
  const debit = roundMoney(lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));
  const credit = roundMoney(lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));
  if (Math.abs(debit - credit) > 0.001) throw new Error(\`傳票借貸不平衡：借 \${debit}／貸 \${credit}\`);
  const codes = [...new Set(lines.map((line) => line.code))];
  const accounts = await tx.chartOfAccount.findMany({
    where: { tenantId: input.tenantId, code: { in: codes }, isActive: true },
    select: { id: true, code: true },
  });
  const accountMap = new Map(accounts.map((account) => [account.code, account.id]));
  const missing = codes.filter((code) => !accountMap.has(code));
  if (missing.length) throw new Error(\`缺少標準會計科目：\${missing.join("、")}，請由管理者執行科目初始化\`);
  await tx.journalEntry.create({
    data: {
      tenantId: input.tenantId,
      number: input.journalNumber,
      entryDate,
      summary: \`POS 背景銷售與收款 \${input.saleNumber}\`,
      status: "POSTED",
      createdById: input.userId,
      postedById: input.userId,
      postedAt: new Date(),
      lines: {
        create: lines.map((line) => ({
          accountId: accountMap.get(line.code)!,
          debit: roundMoney(line.debit ?? 0),
          credit: roundMoney(line.credit ?? 0),
          memo: line.memo,
        })),
      },
    },
  });
}

export async function fulfillPosSale(saleId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtext(\${\`pos-fulfillment:\${saleId}\`}))\`;
    const sale = await tx.posSale.findUnique({
      where: { id: saleId },
      include: {
        shift: { select: { userId: true, register: { select: { warehouseId: true } } } },
        items: { include: { product: { select: { name: true, costPrice: true } } } },
        payments: true,
      },
    });
    if (!sale || sale.salesOrderId || sale.status === "VOIDED") return { fulfilled: false, skipped: true };
    if (!sale.customerId) throw new Error(\`POS \${sale.number} 缺少客戶資料，無法同步 ERP\`);

    const numbers = await nextNumbersFastInTransaction(tx, ["SO", "RP", "JE"], sale.tenantId);
    const operator = await tx.user.findUnique({ where: { id: sale.shift.userId }, select: { name: true, username: true } });
    const updatedBy = operator?.name || operator?.username || "POS 背景同步";
    const subtotal = Number(sale.subtotal);
    const taxAmount = Number(sale.taxAmount);
    const total = Number(sale.total);

    const order = await tx.salesOrder.create({
      data: {
        tenantId: sale.tenantId,
        number: numbers.SO,
        customerId: sale.customerId,
        warehouseId: sale.shift.register.warehouseId,
        status: "POSTED",
        subtotal,
        discount: Number(sale.discount),
        taxAmount,
        total,
        isTaxable: true,
        shippedAt: sale.createdAt,
        remark: \`POS \${sale.number}\`,
        updatedBy,
        items: {
          create: sale.items.map((item) => {
            const quantity = Number(item.quantity);
            const taxRate = Number(item.taxRate);
            const gross = Number(item.subtotal);
            const net = roundMoney(gross / (1 + taxRate));
            return {
              productId: item.productId,
              quantity,
              shippedQty: quantity,
              unitPrice: quantity > 0 ? roundMoney(net / quantity) : 0,
              discount: Number(item.discount),
              taxRate,
              subtotal: net,
            };
          }),
        },
      },
      select: { id: true },
    });

    const receivable = await tx.accountsReceivable.create({
      data: {
        tenantId: sale.tenantId,
        customerId: sale.customerId,
        salesOrderId: order.id,
        amount: total,
        paidAmount: total,
        status: "PAID",
        updatedBy,
      },
      select: { id: true },
    });

    await tx.receivePayment.create({
      data: {
        tenantId: sale.tenantId,
        number: numbers.RP,
        customerId: sale.customerId,
        receivableId: receivable.id,
        amount: total,
        method: sale.payments.length > 1 ? "MIXED" : sale.payments[0]?.method || "CASH",
        remark: \`POS \${sale.number}\`,
        updatedBy,
      },
    });

    await tx.inventoryTransaction.createMany({
      data: sale.items.map((item) => ({
        tenantId: sale.tenantId,
        productId: item.productId,
        warehouseId: sale.shift.register.warehouseId,
        type: "SALES_OUT",
        quantity: Number(item.quantity) * -1,
        unitCost: Number(item.product.costPrice),
        refType: "POS",
        refId: sale.id,
        remark: \`POS 背景同步 \${sale.number}\`,
      })),
    });

    const cogs = roundMoney(sale.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.product.costPrice), 0));
    await createCheckoutJournal(tx, {
      tenantId: sale.tenantId,
      userId: sale.shift.userId,
      journalNumber: numbers.JE,
      saleNumber: sale.number,
      lines: [
        ...sale.payments.filter((payment) => Number(payment.amount) > 0).map((payment) => ({
          code: payment.method === "CASH" ? "1101" : "1103",
          debit: Number(payment.amount),
          memo: \`\${payment.method} 收款－\${sale.number}\`,
        })),
        { code: "4101", credit: subtotal, memo: \`銷貨收入－\${sale.number}\` },
        { code: "2111", credit: taxAmount, memo: \`銷項稅額－\${sale.number}\` },
        { code: "5101", debit: cogs, memo: \`銷貨成本－\${sale.number}\` },
        { code: "1201", credit: cogs, memo: \`存貨－\${sale.number}\` },
      ],
    });

    await tx.posSale.update({ where: { id: sale.id }, data: { salesOrderId: order.id } });
    return { fulfilled: true, skipped: false };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}

export async function drainPendingPosSales(tenantId: string, limit = 3) {
  const pending = await prisma.posSale.findMany({
    where: { tenantId, salesOrderId: null, status: { not: "VOIDED" } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 10)),
  });
  const results = await Promise.allSettled(pending.map((sale) => fulfillPosSale(sale.id)));
  for (const result of results) {
    if (result.status === "rejected") console.error("[pos-fulfillment] retry failed", result.reason);
  }
}
`;
write(fulfillmentPath, fulfillment);

const checkoutPath = "src/app/api/pos/checkout/route.ts";
let checkout = read(checkoutPath);
checkout = replaceOnce(
  checkout,
  'import { lockAndAssertAccountingPeriodOpen } from "@/lib/accounting-controls";\n',
  '',
  "移除同步會計期間鎖",
);
checkout = replaceOnce(
  checkout,
  'import { nextNumbersFastInTransaction } from "@/lib/number-sequence";\n',
  'import { nextNumberFastInTransaction } from "@/lib/number-sequence";\nimport { drainPendingPosSales, fulfillPosSale } from "@/lib/pos-fulfillment";\n',
  "改用快速 POS 單號與背景履約",
);
checkout = replaceOnce(checkout, 'type CheckoutJournalLine = { code: string; debit?: number; credit?: number; memo: string };\n\n', '', "移除前台傳票型別");
checkout = replaceRegex(
  checkout,
  /\nasync function createCheckoutJournal\([\s\S]*?\n}\n\nexport const POST/,
  '\nexport const POST',
  'export const POST = apiHandler',
  "移除前台傳票建立",
);
checkout = replaceOnce(
  checkout,
  '    const numbers = await nextNumbersFastInTransaction(tx, ["SO", "RP", "POS", "JE"], tenantId);\n    const soNumber = numbers.SO;\n    const paymentNumber = numbers.RP;\n    const posNumber = numbers.POS;\n',
  '    const posNumber = await nextNumberFastInTransaction(tx, "POS", tenantId);\n',
  "前台只配置 POS 單號",
);
checkout = replaceRegex(
  checkout,
  /\n    const order = await tx\.salesOrder\.create\([\s\S]*?await tx\.receivePayment\.create\([\s\S]*?\);\n\n    const sale = await tx\.posSale\.create\(/,
  '\n    const sale = await tx.posSale.create(',
  'const sale = await tx.posSale.create(',
  "移除前台 ERP 單據",
);
checkout = replaceOnce(
  checkout,
  'customerId: customer.id, salesOrderId: order.id, exchangeRefundId:',
  'customerId: customer.id, exchangeRefundId:',
  "POS 銷售先不綁 ERP 訂單",
);
checkout = replaceRegex(
  checkout,
  /\n    await tx\.inventoryTransaction\.createMany\([\s\S]*?\n    return \{ sale, replayed: false,/,
  '\n    return { sale, replayed: false,',
  'return { sale, replayed: false,',
  "ERP 庫存流水與傳票改背景",
);
checkout = replaceOnce(
  checkout,
  '  if (!result.replayed) after(async () => { try { await audit({ userId: session.user.id, action: "checkout", module: "pos", refId: result.sale.id, detail: result.sale.number }); } catch (error) { console.error("[pos-checkout] audit failed", error); } });\n  if (result.eInvoiceEventId) after(async () => { try { await processEInvoiceEvent(result.eInvoiceEventId!); } catch (error) { console.error("[pos-checkout] e-invoice background processing failed", error); } });\n\n  return NextResponse.json({ ok: true, sale: { ...result.sale, electronicInvoice: result.electronicInvoice ?? (result.sale as any).electronicInvoice ?? null }, changeDue: Number(result.sale.changeDue), replayed: result.replayed });',
  '  after(async () => {\n    const jobs: Promise<unknown>[] = [fulfillPosSale(result.sale.id)];\n    if (!result.replayed) jobs.push(audit({ userId: session.user.id, action: "checkout", module: "pos", refId: result.sale.id, detail: result.sale.number }));\n    if (result.eInvoiceEventId) jobs.push(processEInvoiceEvent(result.eInvoiceEventId));\n    const settled = await Promise.allSettled(jobs);\n    for (const job of settled) {\n      if (job.status === "rejected") console.error("[pos-checkout] background job failed", job.reason);\n    }\n    try { await drainPendingPosSales(tenantId, 3); } catch (error) { console.error("[pos-checkout] pending sync retry failed", error); }\n  });\n\n  return NextResponse.json({ ok: true, sale: { ...result.sale, electronicInvoice: result.electronicInvoice ?? (result.sale as any).electronicInvoice ?? null }, changeDue: Number(result.sale.changeDue), replayed: result.replayed, erpSync: "QUEUED" });',
  "回應後執行進銷存與帳務同步",
);
write(checkoutPath, checkout);

const retailPath = "src/app/(app)/pos/pos-workspace.tsx";
let retail = read(retailPath);
retail = replaceOnce(
  retail,
  'const [lastReceipt, setLastReceipt] = useState<{ id: string; number: string; total: number; changeDue: number; electronicInvoice?: { provider: string; status: string; invoiceNumber?: string | null; lastError?: string | null } | null } | null>(null);',
  'const [lastReceipt, setLastReceipt] = useState<{ id: string; number: string; total: number; changeDue: number; paymentSummary: string; electronicInvoice?: { provider: string; status: string; invoiceNumber?: string | null; lastError?: string | null } | null } | null>(null);',
  "一般 POS 收據加入付款摘要",
);
retail = replaceOnce(
  retail,
  '    if (!payments.length || totalPaid < total) return toast.error("付款金額不足");\n    if (totalPaid > total && !payments.some((payment) => payment.method === "CASH")) return toast.error("非現金付款不可超收找零");\n    setBusy(true);',
  '    if (!payments.length || totalPaid < total) return toast.error("付款金額不足");\n    if (payments.some((payment) => payment.method === "CARD" && !payment.reference)) return toast.error("請先完成刷卡機交易，並輸入授權碼或卡號末四碼");\n    if (totalPaid > total && !payments.some((payment) => payment.method === "CASH")) return toast.error("非現金付款不可超收找零");\n    setBusy(true);',
  "一般 POS 刷卡完成驗證",
);
retail = replaceOnce(
  retail,
  '      persistLocalCart(currentCartPayload(), checkoutRequestIdRef.current);\n      // 先等候已在途的草稿 PUT，避免交易完成後慢到的舊 PUT 重建已清除草稿。\n      await draftSaveQueueRef.current;\n      autosaveReadyRef.current = false;\n      const res = await fetch("/api/pos/checkout", {',
  '      persistLocalCart(currentCartPayload(), checkoutRequestIdRef.current);\n      // 結帳不再等待慢速伺服器草稿；交易先送出，成功後再依序清理舊草稿。\n      const pendingDraftSave = draftSaveQueueRef.current.catch(() => undefined);\n      autosaveReadyRef.current = false;\n      const res = await fetch("/api/pos/checkout", {',
  "一般 POS 不等待草稿同步",
);
retail = replaceOnce(
  retail,
  '      setLastReceipt({ id: data.sale.id, number: data.sale.number, total: Number(data.sale.total), changeDue: Number(data.changeDue), electronicInvoice: data.sale.electronicInvoice ?? null });',
  '      setLastReceipt({ id: data.sale.id, number: data.sale.number, total: Number(data.sale.total), changeDue: Number(data.changeDue), paymentSummary: payments.map((payment) => `${payment.method}${payment.reference ? ` ${payment.reference}` : ""}`).join(" + "), electronicInvoice: data.sale.electronicInvoice ?? null });',
  "一般 POS 顯示刷卡結果",
);
retail = replaceOnce(
  retail,
  '        const draftRes = await fetch(`/api/pos/draft?shiftId=${encodeURIComponent(shift.id)}`, { method: "DELETE" });',
  '        await pendingDraftSave;\n        const draftRes = await fetch(`/api/pos/draft?shiftId=${encodeURIComponent(shift.id)}`, { method: "DELETE" });',
  "背景清理草稿先等待舊請求",
);
retail = replaceOnce(
  retail,
  '      toast.success("交易完成，庫存與帳務已同步");',
  '      toast.success("收款完成；庫存、進銷存與帳務正在背景同步");',
  "一般 POS 即時完成提示",
);
retail = replaceOnce(
  retail,
  '<div>交易 {lastReceipt.number} 完成 · {formatTwd(lastReceipt.total)} · 找零 {formatTwd(lastReceipt.changeDue)}</div>',
  '<div>交易 {lastReceipt.number} 完成 · {formatTwd(lastReceipt.total)} · 找零 {formatTwd(lastReceipt.changeDue)}</div><div className="mt-1 text-xs font-medium">付款：{lastReceipt.paymentSummary} · ERP 背景同步中</div>',
  "一般 POS 收據付款後流程",
);
retail = replaceOnce(
  retail,
  '{payment.method !== "CASH" && <input value={payment.reference} onChange={(event) => updatePayment(index, { reference: event.target.value })} placeholder="交易序號／末四碼（選填）" className="h-9 w-full rounded-lg border bg-background px-3 text-xs" />}',
  '{payment.method !== "CASH" && <><input value={payment.reference} onChange={(event) => updatePayment(index, { reference: event.target.value })} placeholder={payment.method === "CARD" ? "刷卡授權碼／卡號末四碼（必填）" : "交易序號（選填）"} className="h-9 w-full rounded-lg border bg-background px-3 text-xs" />{payment.method === "CARD" && <div className="text-[11px] text-indigo-700">先在刷卡機完成感應／插卡，確認成功後輸入授權碼或末四碼，再按確認結帳。</div>}</>}',
  "一般 POS 刷卡指引",
);
write(retailPath, retail);

const restaurantPath = "src/app/(app)/pos/restaurant/restaurant-workspace.tsx";
let restaurant = read(restaurantPath);
restaurant = replaceOnce(
  restaurant,
  'import { useCallback, useEffect, useMemo, useState } from "react";',
  'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
  "餐飲 POS 加入點餐佇列 ref",
);
restaurant = replaceOnce(
  restaurant,
  '  ArchiveRestore,\n  ChefHat,',
  '  ArchiveRestore,\n  Banknote,\n  CheckCircle2,\n  ChefHat,',
  "餐飲付款圖示",
);
restaurant = replaceOnce(
  restaurant,
  '  const [lastSaleId, setLastSaleId] = useState("");\n  const [lastKitchenTicketId, setLastKitchenTicketId] = useState("");',
  '  const [lastSaleId, setLastSaleId] = useState("");\n  const [lastPayment, setLastPayment] = useState<{ number: string; method: "CASH" | "CARD"; paidAmount: number; changeDue: number; reference?: string | null } | null>(null);\n  const [paymentDialog, setPaymentDialog] = useState<"CASH" | "CARD" | null>(null);\n  const [cashReceived, setCashReceived] = useState("");\n  const [cardReference, setCardReference] = useState("");\n  const [cardApproved, setCardApproved] = useState(false);\n  const checkoutRequestIdRef = useRef("");\n  const addQueueRef = useRef(new Map<string, { orderId: string; product: Product; queued: number; inFlight: boolean; timer: number | null }>());\n  const [lastKitchenTicketId, setLastKitchenTicketId] = useState("");',
  "餐飲 POS 付款與快速點餐狀態",
);
restaurant = replaceOnce(
  restaurant,
  '  async function action(payload: Record<string, unknown>, success?: string, refresh = true) {\n    setBusy(true);',
  '  async function action(payload: Record<string, unknown>, success?: string, refresh = true, blocking = true) {\n    if (blocking) setBusy(true);',
  "餐飲動作可非阻塞",
);
restaurant = replaceOnce(
  restaurant,
  '    } finally {\n      setBusy(false);\n    }\n  }\n\n  async function openTable',
  '    } finally {\n      if (blocking) setBusy(false);\n    }\n  }\n\n  async function openTable',
  "餐飲非阻塞動作收尾",
);
restaurant = replaceRegex(
  restaurant,
  /\n  async function addItem\(product: Product\) \{[\s\S]*?\n  }\n\n  async function updateItem/,
  `
  function addItem(product: Product) {
    if (!selectedOrder) return;
    const orderId = selectedOrder.id;
    const key = \`${orderId}:\${product.id}\`;
    updateOrderLocally(orderId, (order) => {
      const existing = order.items.find((item) => item.productId === product.id && item.status === "PENDING");
      if (existing) return { ...order, items: order.items.map((item) => item.id === existing.id ? { ...item, quantity: Number(item.quantity) + 1 } : item) };
      const optimistic: OrderItem = { id: \`optimistic:\${key}\`, productId: product.id, quantity: 1, unitPrice: product.salePrice, note: null, status: "PENDING", product };
      return { ...order, items: [...order.items, optimistic] };
    });

    let queued = addQueueRef.current.get(key);
    if (!queued) {
      queued = { orderId, product, queued: 0, inFlight: false, timer: null };
      addQueueRef.current.set(key, queued);
    }
    queued.queued += 1;
    if (!queued.inFlight && queued.timer === null) queued.timer = window.setTimeout(() => void flushAddQueue(key), 80);
  }

  async function flushAddQueue(key: string) {
    const queued = addQueueRef.current.get(key);
    if (!queued || queued.inFlight || queued.queued <= 0) return;
    queued.timer = null;
    const quantity = queued.queued;
    queued.queued = 0;
    queued.inFlight = true;
    const result = await action({ action: "ADD_ITEM", orderId: queued.orderId, productId: queued.product.id, quantity, note: "" }, undefined, false, false);
    if (!result?.item) {
      addQueueRef.current.delete(key);
      await load();
      return;
    }
    updateOrderLocally(queued.orderId, (order) => {
      const current = order.items.find((item) => item.productId === queued.product.id && item.status === "PENDING");
      if (!current) return order;
      const quantityToShow = queued.queued > 0 ? Number(current.quantity) : Number(result.item.quantity);
      return { ...order, items: order.items.map((item) => item.id === current.id ? { ...result.item, quantity: quantityToShow } : item) };
    });
    queued.inFlight = false;
    if (queued.queued > 0) queued.timer = window.setTimeout(() => void flushAddQueue(key), 40);
    else addQueueRef.current.delete(key);
  }

  async function updateItem`,
  'function addItem(product: Product)',
  "餐飲點餐即時更新與合併送出",
);
restaurant = replaceRegex(
  restaurant,
  /\n  async function checkout\(method: "CASH" \| "CARD"\) \{[\s\S]*?\n  }\n\n  if \(loading\)/,
  `
  function openPaymentDialog(method: "CASH" | "CARD") {
    setPaymentDialog(method);
    setCashReceived("");
    setCardReference("");
    setCardApproved(false);
  }

  async function checkout(method: "CASH" | "CARD", tendered: number, reference?: string) {
    if (!data?.openShift || !selectedOrder || orderTotal <= 0) return;
    if (selectedOrder.items.some((item) => item.status === "PENDING")) {
      toast.error("請先把所有餐點送廚，再進行結帳");
      return;
    }
    if (method === "CASH" && tendered < orderTotal) return toast.error("實收現金不足");
    if (method === "CARD" && (!cardApproved || !reference?.trim())) return toast.error("請確認刷卡機已核准，並輸入授權碼或末四碼");
    setBusy(true);
    try {
      if (!checkoutRequestIdRef.current) checkoutRequestIdRef.current = crypto.randomUUID();
      const response = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: checkoutRequestIdRef.current,
          shiftId: data.openShift.id,
          restaurantOrderId: selectedOrder.id,
          items: selectedOrder.items
            .filter((item) => item.status !== "CANCELLED")
            .map((item) => ({ productId: item.productId, quantity: Number(item.quantity), discount: 0 })),
          payments: [{ method, amount: tendered, reference: reference?.trim() || null }],
          invoice: invoiceMode === "NONE" ? null : {
            mode: invoiceMode,
            buyerTaxId: invoiceBuyerTaxId.trim() || null,
            carrierId: invoiceCarrierId.trim().toUpperCase() || null,
            donationCode: invoiceDonationCode.trim() || null,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) checkoutRequestIdRef.current = "";
        throw new Error(result.error || "結帳失敗");
      }
      const completedOrderId = selectedOrder.id;
      const completedTableId = selectedTable?.id;
      const soldByProduct = new Map<string, number>();
      for (const item of selectedOrder.items) {
        if (item.status === "CANCELLED") continue;
        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + Number(item.quantity));
      }
      setData((current) => current ? {
        ...current,
        products: current.products.map((product) => ({ ...product, stockTotal: Math.max(0, product.stockTotal - (soldByProduct.get(product.id) ?? 0)) })),
        areas: current.areas.map((area) => ({
          ...area,
          tables: area.tables.map((table) => table.id === completedTableId
            ? { ...table, status: "AVAILABLE", orders: table.orders.filter((order) => order.id !== completedOrderId) }
            : table),
        })),
      } : current);
      setLastSaleId(result.sale.id);
      setLastPayment({ number: result.sale.number, method, paidAmount: tendered, changeDue: Number(result.changeDue), reference: reference?.trim() || null });
      setSelectedTableId("");
      setPaymentDialog(null);
      checkoutRequestIdRef.current = "";
      toast.success(\`收款完成：\${result.sale.number}；進銷存與帳務背景同步中\`);
      window.setTimeout(() => void load(), 1_200);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "結帳失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading)`,
  'function openPaymentDialog(method: "CASH" | "CARD")',
  "餐飲現金與刷卡完整流程",
);
restaurant = replaceOnce(
  restaurant,
  '<button disabled={busy || orderTotal <= 0} onClick={() => void checkout("CASH")} className="h-11 rounded-xl bg-emerald-600 font-bold text-white">現金結帳</button>\n                  <button disabled={busy || orderTotal <= 0} onClick={() => void checkout("CARD")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white"><CreditCard className="h-4 w-4" />刷卡結帳</button>',
  '<button disabled={busy || orderTotal <= 0} onClick={() => openPaymentDialog("CASH")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white"><Banknote className="h-4 w-4" />現金結帳</button>\n                  <button disabled={busy || orderTotal <= 0} onClick={() => openPaymentDialog("CARD")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white"><CreditCard className="h-4 w-4" />刷卡結帳</button>',
  "餐飲付款按鈕開啟流程",
);
restaurant = replaceOnce(
  restaurant,
  '{lastSaleId && <button onClick={() => window.open(`/print/pos/${lastSaleId}?print=1`, "_blank", "noopener,noreferrer")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm"><ReceiptText className="h-4 w-4" />列印收據</button>}',
  '{lastPayment && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4" />{lastPayment.number} 收款完成</div><div className="mt-1">{lastPayment.method === "CASH" ? `實收 ${money(lastPayment.paidAmount)}・找零 ${money(lastPayment.changeDue)}` : `刷卡核准 ${lastPayment.reference}`}</div><div className="mt-1">進銷存、庫存流水與會計傳票背景同步中</div></div>}\n                {lastSaleId && <button onClick={() => window.open(`/print/pos/${lastSaleId}?print=1`, "_blank", "noopener,noreferrer")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm"><ReceiptText className="h-4 w-4" />列印收據</button>}',
  "餐飲付款完成結果",
);
restaurant = replaceOnce(
  restaurant,
  '      {allowTableManagement && <TableManager open={tableManagerOpen} onOpenChange={setTableManagerOpen} areas={data.tableSettings ?? []} busy={busy} onAction={action} />}\n\n      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_350px]">',
  '      {allowTableManagement && <TableManager open={tableManagerOpen} onOpenChange={setTableManagerOpen} areas={data.tableSettings ?? []} busy={busy} onAction={action} />}\n\n      <Dialog open={paymentDialog !== null} onOpenChange={(open) => { if (!open && !busy) setPaymentDialog(null); }}>\n        <DialogContent className="max-w-md">\n          <DialogHeader><DialogTitle>{paymentDialog === "CASH" ? "現金收款" : "刷卡確認"}</DialogTitle><DialogDescription>桌單金額 {money(orderTotal)}。收款完成後前台立即結帳，ERP 與帳務在背景同步。</DialogDescription></DialogHeader>\n          {paymentDialog === "CASH" ? <div className="space-y-4">\n            <label className="block text-sm font-bold">實收現金<input autoFocus value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} inputMode="decimal" placeholder="請輸入客人交付金額" className="mt-2 h-12 w-full rounded-xl border bg-background px-3 text-right text-xl font-black" /></label>\n            <div className="grid grid-cols-4 gap-2">{[orderTotal, Math.ceil(orderTotal / 100) * 100, Math.ceil(orderTotal / 500) * 500, Math.ceil(orderTotal / 1000) * 1000].filter((value, index, values) => values.indexOf(value) === index).map((value) => <button key={value} onClick={() => setCashReceived(String(value))} className="h-9 rounded-lg border text-xs">{value === orderTotal ? "剛好" : money(value)}</button>)}</div>\n            <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-4"><span className="text-sm text-emerald-800">找零</span><strong className="text-2xl text-emerald-800">{money(Math.max(0, Number(cashReceived || 0) - orderTotal))}</strong></div>\n            <button disabled={busy || Number(cashReceived || 0) < orderTotal} onClick={() => void checkout("CASH", Number(cashReceived || 0))} className="h-12 w-full rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-40">確認收現並完成結帳</button>\n          </div> : paymentDialog === "CARD" ? <div className="space-y-4">\n            <ol className="list-decimal space-y-2 rounded-xl bg-indigo-50 p-4 pl-8 text-sm text-indigo-900"><li>在刷卡機感應、插卡或刷卡</li><li>等待刷卡機顯示交易成功</li><li>輸入授權碼或卡號末四碼</li></ol>\n            <input autoFocus value={cardReference} onChange={(event) => setCardReference(event.target.value.toUpperCase())} placeholder="授權碼／卡號末四碼" className="h-11 w-full rounded-xl border bg-background px-3 font-mono uppercase" />\n            <label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={cardApproved} onChange={(event) => setCardApproved(event.target.checked)} className="mt-1" /><span><strong>刷卡機已顯示核准</strong><span className="mt-1 block text-xs text-muted-foreground">未核准不可完成 POS 結帳，避免刷卡失敗卻誤記收款。</span></span></label>\n            <button disabled={busy || !cardApproved || cardReference.trim().length < 4} onClick={() => void checkout("CARD", orderTotal, cardReference)} className="h-12 w-full rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-40">確認刷卡核准並完成結帳</button>\n          </div> : null}\n        </DialogContent>\n      </Dialog>\n\n      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_350px]">',
  "餐飲付款對話框",
);
write(restaurantPath, restaurant);

console.log("POS fast checkout v4 patch applied");
