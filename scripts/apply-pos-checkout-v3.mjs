import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/api/pos/checkout/route.ts";
let source = readFileSync(path, "utf8");

function replaceExact(search, replacement, label) {
  if (source.includes(replacement)) return;
  if (!source.includes(search)) throw new Error(`找不到定位點：${label}`);
  source = source.replace(search, replacement);
}

function replaceRange(startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`找不到起點：${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`找不到終點：${label}`);
  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

source = source.replace(
  'import { nextNumberFastInTransaction } from "@/lib/number-sequence";',
  'import { nextNumbersFastInTransaction } from "@/lib/number-sequence";',
);

if (!source.includes("const walkInCustomerIdCache")) {
  const marker = "async function decrementCheckoutStocks(";
  const index = source.indexOf(marker);
  if (index < 0) throw new Error("找不到扣庫存函式");
  const helper = [
    'const walkInCustomerIdCache = new Map<string, string>();',
    '',
    'async function getWalkInCustomerId(tenantId: string) {',
    '  const cached = walkInCustomerIdCache.get(tenantId);',
    '  if (cached) return cached;',
    '  const customer = await prisma.customer.upsert({',
    '    where: { tenantId_code: { tenantId, code: "POS-WALKIN" } },',
    '    update: { isActive: true },',
    '    create: { tenantId, code: "POS-WALKIN", companyName: "門市散客" },',
    '    select: { id: true },',
    '  });',
    '  walkInCustomerIdCache.set(tenantId, customer.id);',
    '  return customer.id;',
    '}',
    '',
  ].join("\n");
  source = `${source.slice(0, index)}${helper}${source.slice(index)}`;
}

const journalFunction = [
  'async function createCheckoutJournal(',
  '  tx: any,',
  '  input: { tenantId: string; userId: string; journalNumber: string; saleNumber: string; lines: CheckoutJournalLine[] },',
  ') {',
  '  const entryDate = new Date();',
  '  await lockAndAssertAccountingPeriodOpen(tx, input.tenantId, entryDate);',
  '  const lines = input.lines.filter((line) => roundMoney(line.debit ?? 0) !== 0 || roundMoney(line.credit ?? 0) !== 0);',
  '  const debit = roundMoney(lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));',
  '  const credit = roundMoney(lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));',
  '  if (Math.abs(debit - credit) > 0.001) throw new Error(`傳票借貸不平衡：借 ${debit}／貸 ${credit}`);',
  '  const codes = [...new Set(lines.map((line) => line.code))];',
  '  const accounts = await tx.chartOfAccount.findMany({ where: { tenantId: input.tenantId, code: { in: codes }, isActive: true }, select: { id: true, code: true } });',
  '  const accountMap = new Map(accounts.map((account: any) => [account.code, account.id]));',
  '  const missing = codes.filter((code) => !accountMap.has(code));',
  '  if (missing.length) throw new Error(`缺少標準會計科目：${missing.join("、")}，請由管理者執行科目初始化`);',
  '  await tx.journalEntry.create({',
  '    data: {',
  '      tenantId: input.tenantId, number: input.journalNumber, entryDate,',
  '      summary: `POS 即時銷售與收款 ${input.saleNumber}`, status: "POSTED",',
  '      createdById: input.userId, postedById: input.userId, postedAt: new Date(),',
  '      lines: { create: lines.map((line) => ({ accountId: accountMap.get(line.code), debit: roundMoney(line.debit ?? 0), credit: roundMoney(line.credit ?? 0), memo: line.memo })) },',
  '    },',
  '  });',
  '}',
  '',
  '',
].join("\n");
replaceRange("async function createCheckoutJournals(", "export const POST", journalFunction, "合併傳票函式");

const preflight = [
  '  const normalizedItems = normalizeItems(body.items);',
  '  const productIds = normalizedItems.map((item) => item.productId);',
  '  const now = new Date();',
  '  const activePromotionWindow = {',
  '    isActive: true,',
  '    AND: [',
  '      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },',
  '      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },',
  '    ],',
  '  };',
  '  const [priorSale, shift, products, preloadedPromotions, walkInCustomerId] = await Promise.all([',
  '    prisma.posSale.findFirst({ where: { tenantId, clientRequestId: body.requestId }, include: { payments: true, electronicInvoice: true } }),',
  '    prisma.posShift.findFirst({ where: { id: body.shiftId, tenantId, userId: session.user.id, status: "OPEN" }, select: { id: true, registerId: true, register: { select: { warehouseId: true } } } }),',
  '    prisma.product.findMany({ where: { tenantId, id: { in: productIds }, isActive: true }, select: { id: true, sku: true, name: true, salePrice: true, costPrice: true, taxRate: { select: { rate: true } } } }),',
  '    prisma.posPromotion.findMany({ where: { tenantId, ...activePromotionWindow }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),',
  '    body.customerId ? Promise.resolve(null) : getWalkInCustomerId(tenantId),',
  '  ]);',
  '  if (priorSale) return NextResponse.json({ ok: true, sale: priorSale, changeDue: Number(priorSale.changeDue), replayed: true });',
  '',
].join("\n");
replaceRange("  const priorSale = await prisma.posSale.findFirst", "  if (!shift) throw", preflight, "並行預查");

if (!source.includes("const eligiblePromotions")) {
  source = source.replace(
    "  const baseTotal = money(computedBeforeOffers.reduce((sum, item) => sum + item.gross, 0));",
    "  const baseTotal = money(computedBeforeOffers.reduce((sum, item) => sum + item.gross, 0));\n  const eligiblePromotions = preloadedPromotions.filter((item: any) => Number(item.minSpend) <= baseTotal);",
  );
}

replaceExact(
  '    const soNumber = await nextNumberFastInTransaction(tx, "SO", tenantId);\n    const paymentNumber = await nextNumberFastInTransaction(tx, "RP", tenantId);\n    const posNumber = await nextNumberFastInTransaction(tx, "POS", tenantId);',
  '    const numbers = await nextNumbersFastInTransaction(tx, ["SO", "RP", "POS", "JE"], tenantId);\n    const soNumber = numbers.SO;\n    const paymentNumber = numbers.RP;\n    const posNumber = numbers.POS;',
  "批次單號",
);

replaceExact(
  '    const customer = body.customerId\n      ? await tx.customer.findFirst({ where: { id: body.customerId, tenantId, isActive: true }, select: { id: true } })\n      : await tx.customer.upsert({ where: { tenantId_code: { tenantId, code: "POS-WALKIN" } }, update: { isActive: true }, create: { tenantId, code: "POS-WALKIN", companyName: "門市散客" }, select: { id: true } });',
  '    const customer = body.customerId\n      ? await tx.customer.findFirst({ where: { id: body.customerId, tenantId, isActive: true }, select: { id: true } })\n      : { id: walkInCustomerId! };',
  "散客快取",
);

source = source.replace(
  "const offers = await resolveCheckoutOffers(tx, { tenantId, customerId: body.customerId ? customer.id : null, baseTotal, promotionId: body.promotionId, couponCode: body.couponCode, redeemPoints: body.redeemPoints });",
  "const offers = await resolveCheckoutOffers(tx, { tenantId, customerId: body.customerId ? customer.id : null, baseTotal, promotionId: body.promotionId, couponCode: body.couponCode, redeemPoints: body.redeemPoints, promotions: eligiblePromotions });",
);

replaceExact(
  '    if (restaurantOrder) {\n      await tx.restaurantOrder.update({ where: { id: restaurantOrder.id }, data: { status: "COMPLETED", posSaleId: sale.id, completedAt: new Date() } });\n      await tx.restaurantTable.update({ where: { id: restaurantOrder.tableId }, data: { status: "AVAILABLE" } });\n    }',
  [
    '    if (restaurantOrder) {',
    '      await tx.$executeRaw`',
    '        WITH completed AS (',
    '          UPDATE "RestaurantOrder"',
    '          SET "status" = \'COMPLETED\', "posSaleId" = ${sale.id}, "completedAt" = NOW(), "updatedAt" = NOW()',
    '          WHERE "id" = ${restaurantOrder.id}',
    '          RETURNING "tableId"',
    '        )',
    '        UPDATE "RestaurantTable" AS table_row',
    '        SET "status" = \'AVAILABLE\', "updatedAt" = NOW()',
    '        FROM completed',
    '        WHERE table_row."id" = completed."tableId"',
    '      `;',
    '    }',
  ].join("\n"),
  "餐桌單次完成",
);

const journalCall = [
  '    await createCheckoutJournal(tx, {',
  '      tenantId,',
  '      userId: session.user.id,',
  '      journalNumber: numbers.JE,',
  '      saleNumber: posNumber,',
  '      lines: [',
  '        ...drawerPayments.filter((item) => item.amount > 0).map((item) => ({ code: item.method === "CASH" ? "1101" : "1103", debit: item.amount, memo: `${item.method} 收款－${posNumber}` })),',
  '        { code: "4101", credit: subtotal, memo: `銷貨收入－${posNumber}` },',
  '        { code: "2111", credit: taxAmount, memo: `銷項稅額－${posNumber}` },',
  '        { code: "5101", debit: cogs, memo: `銷貨成本－${posNumber}` },',
  '        { code: "1201", credit: cogs, memo: `存貨－${posNumber}` },',
  '      ],',
  '    });',
  '',
].join("\n");
replaceRange("    await createCheckoutJournals(tx, {", "    return { sale, replayed:", journalCall, "單張即時傳票");

writeFileSync(path, source);
console.log("POS checkout v3 patch applied.");
