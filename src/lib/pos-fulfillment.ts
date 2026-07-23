import { Prisma } from "@prisma/client";
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
  if (Math.abs(debit - credit) > 0.001) throw new Error(`傳票借貸不平衡：借 ${debit}／貸 ${credit}`);
  const codes = [...new Set(lines.map((line) => line.code))];
  const accounts = await tx.chartOfAccount.findMany({
    where: { tenantId: input.tenantId, code: { in: codes }, isActive: true },
    select: { id: true, code: true },
  });
  const accountMap = new Map(accounts.map((account) => [account.code, account.id]));
  const missing = codes.filter((code) => !accountMap.has(code));
  if (missing.length) throw new Error(`缺少標準會計科目：${missing.join("、")}，請由管理者執行科目初始化`);
  await tx.journalEntry.create({
    data: {
      tenantId: input.tenantId,
      number: input.journalNumber,
      entryDate,
      summary: `POS 背景銷售與收款 ${input.saleNumber}`,
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-fulfillment:${saleId}`}))`;
    const sale = await tx.posSale.findUnique({
      where: { id: saleId },
      include: {
        shift: { select: { userId: true, register: { select: { warehouseId: true } } } },
        items: { include: { product: { select: { name: true, costPrice: true } } } },
        payments: true,
      },
    });
    if (!sale || sale.salesOrderId || sale.status === "VOIDED") return { fulfilled: false, skipped: true };
    if (!sale.customerId) throw new Error(`POS ${sale.number} 缺少客戶資料，無法同步 ERP`);

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
        remark: `POS ${sale.number}`,
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
        remark: `POS ${sale.number}`,
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
        remark: `POS 背景同步 ${sale.number}`,
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
          memo: `${payment.method} 收款－${sale.number}`,
        })),
        { code: "4101", credit: subtotal, memo: `銷貨收入－${sale.number}` },
        { code: "2111", credit: taxAmount, memo: `銷項稅額－${sale.number}` },
        { code: "5101", debit: cogs, memo: `銷貨成本－${sale.number}` },
        { code: "1201", credit: cogs, memo: `存貨－${sale.number}` },
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
