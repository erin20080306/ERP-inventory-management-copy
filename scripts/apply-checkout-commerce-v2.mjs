import { readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => { writeFileSync(path, content); console.log(`${path}: optimized`); };

function replaceExact(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`找不到定位點：${label}`);
  return source.replace(search, replacement);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`找不到起點：${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`找不到終點：${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

// 1. Batch allocate SO/RP/POS/JE numbers in one database round trip.
{
  const path = "src/lib/number-sequence.ts";
  let source = read(path);
  if (!source.includes('import { randomUUID } from "node:crypto";')) {
    source = `import { randomUUID } from "node:crypto";\nimport { Prisma } from "@prisma/client";\n\n${source}`;
  }
  if (!source.includes("export async function nextNumbersFastInTransaction")) {
    source += String.raw`

type NumberSequenceBatchRow = { key: string; prefix: string; format: string; nextNo: number };

function formatBatchNumber(row: NumberSequenceBatchRow, now: Date) {
  const allocatedNo = Math.max(1, Number(row.nextNo) - 1);
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(2);
  const roc = String(now.getFullYear() - 1911);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const seq = String(allocatedNo).padStart(4, "0");
  const isJournal = row.key === "JE";
  const format = row.format || (isJournal ? "{roc}{mm}{dd}{seq:0000}" : "{prefix}{yyyy}{mm}-{seq:0000}");
  return format
    .replace("{prefix}", isJournal ? "" : row.prefix)
    .replace("{roc}", roc)
    .replace("{yyyy}", yyyy)
    .replace("{yy}", yy)
    .replace("{mm}", mm)
    .replace("{dd}", dd)
    .replace("{seq:0000}", seq);
}

export async function nextNumbersFastInTransaction(tx: any, keys: string[], tenantId: string) {
  const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  if (!uniqueKeys.length) return {} as Record<string, string>;
  const rows = await tx.$queryRaw<NumberSequenceBatchRow[]>(Prisma.sql`
    INSERT INTO "NumberSequence" AS ns
      ("id", "tenantId", "key", "prefix", "nextNo", "format", "updatedAt")
    VALUES ${Prisma.join(uniqueKeys.map((key) => Prisma.sql`(${randomUUID()}, ${tenantId}, ${key}, ${key}, 2, ${key === "JE" ? "{roc}{mm}{dd}{seq:0000}" : "{prefix}{yyyy}{mm}-{seq:0000}"}, NOW())`))}
    ON CONFLICT ("tenantId", "key") DO UPDATE
    SET "nextNo" = ns."nextNo" + 1, "updatedAt" = NOW()
    RETURNING "key", "prefix", "format", "nextNo"
  `);
  const now = new Date();
  return Object.fromEntries(rows.map((row) => [row.key, formatBatchNumber(row, now)]));
}
`;
  }
  write(path, source);
}

// 2. Allow checkout to reuse promotions loaded during preflight.
{
  const path = "src/lib/pos-offers.ts";
  let source = read(path);
  source = replaceExact(source,
    "  redeemPoints?: number;\n}) {",
    "  redeemPoints?: number;\n  promotions?: any[];\n}) {",
    "預載促銷參數");
  source = replaceExact(source,
    `  const promotions = await tx.posPromotion.findMany({\n    where: { tenantId: input.tenantId, ...activeWindow, minSpend: { lte: input.baseTotal } },\n    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],\n  });`,
    `  const promotions = (input.promotions ?? await tx.posPromotion.findMany({\n    where: { tenantId: input.tenantId, ...activeWindow, minSpend: { lte: input.baseTotal } },\n    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],\n  })).filter((item: any) => Number(item.minSpend) <= input.baseTotal);`,
    "促銷預載快速路徑");
  write(path, source);
}

// 3. Reduce sequential queries in both retail and restaurant POS checkout.
{
  const path = "src/app/api/pos/checkout/route.ts";
  let source = read(path);
  source = source.replace(
    'import { nextNumberFastInTransaction } from "@/lib/number-sequence";',
    'import { nextNumbersFastInTransaction } from "@/lib/number-sequence";',
  );

  if (!source.includes("const walkInCustomerIdCache")) {
    const marker = "async function decrementCheckoutStocks(";
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("找不到扣庫存函式");
    const helper = `const walkInCustomerIdCache = new Map<string, string>();\n\nasync function getWalkInCustomerId(tenantId: string) {\n  const cached = walkInCustomerIdCache.get(tenantId);\n  if (cached) return cached;\n  const customer = await prisma.customer.upsert({\n    where: { tenantId_code: { tenantId, code: "POS-WALKIN" } },\n    update: { isActive: true },\n    create: { tenantId, code: "POS-WALKIN", companyName: "門市散客" },\n    select: { id: true },\n  });\n  walkInCustomerIdCache.set(tenantId, customer.id);\n  return customer.id;\n}\n\n`;
    source = `${source.slice(0, index)}${helper}${source.slice(index)}`;
  }

  const journalFn = `async function createCheckoutJournal(\n  tx: any,\n  input: { tenantId: string; userId: string; journalNumber: string; saleNumber: string; lines: CheckoutJournalLine[] },\n) {\n  const entryDate = new Date();\n  await lockAndAssertAccountingPeriodOpen(tx, input.tenantId, entryDate);\n  const lines = input.lines.filter((line) => roundMoney(line.debit ?? 0) !== 0 || roundMoney(line.credit ?? 0) !== 0);\n  const debit = roundMoney(lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));\n  const credit = roundMoney(lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));\n  if (Math.abs(debit - credit) > 0.001) throw new Error(\`傳票借貸不平衡：借 \\${debit}／貸 \\${credit}\`);\n  const codes = [...new Set(lines.map((line) => line.code))];\n  const accounts = await tx.chartOfAccount.findMany({ where: { tenantId: input.tenantId, code: { in: codes }, isActive: true }, select: { id: true, code: true } });\n  const accountMap = new Map(accounts.map((account: any) => [account.code, account.id]));\n  const missing = codes.filter((code) => !accountMap.has(code));\n  if (missing.length) throw new Error(\`缺少標準會計科目：\\${missing.join("、")}，請由管理者執行科目初始化\`);\n  await tx.journalEntry.create({\n    data: {\n      tenantId: input.tenantId, number: input.journalNumber, entryDate,\n      summary: \`POS 即時銷售與收款 \\${input.saleNumber}\`, status: "POSTED",\n      createdById: input.userId, postedById: input.userId, postedAt: new Date(),\n      lines: { create: lines.map((line) => ({ accountId: accountMap.get(line.code), debit: roundMoney(line.debit ?? 0), credit: roundMoney(line.credit ?? 0), memo: line.memo })) },\n    },\n  });\n}\n\n`;
  source = replaceRange(source, "async function createCheckoutJournals(", "export const POST", journalFn, "合併傳票函式");

  const preflight = `  const normalizedItems = normalizeItems(body.items);\n  const productIds = normalizedItems.map((item) => item.productId);\n  const now = new Date();\n  const activePromotionWindow = { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] };\n  const [priorSale, shift, products, preloadedPromotions, walkInCustomerId] = await Promise.all([\n    prisma.posSale.findFirst({ where: { tenantId, clientRequestId: body.requestId }, include: { payments: true, electronicInvoice: true } }),\n    prisma.posShift.findFirst({ where: { id: body.shiftId, tenantId, userId: session.user.id, status: "OPEN" }, select: { id: true, registerId: true, register: { select: { warehouseId: true } } } }),\n    prisma.product.findMany({ where: { tenantId, id: { in: productIds }, isActive: true }, select: { id: true, sku: true, name: true, salePrice: true, costPrice: true, taxRate: { select: { rate: true } } } }),\n    prisma.posPromotion.findMany({ where: { tenantId, ...activePromotionWindow }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),\n    body.customerId ? Promise.resolve(null) : getWalkInCustomerId(tenantId),\n  ]);\n  if (priorSale) return NextResponse.json({ ok: true, sale: priorSale, changeDue: Number(priorSale.changeDue), replayed: true });\n\n`;
  source = replaceRange(source, "  const priorSale = await prisma.posSale.findFirst", "  if (!shift) throw", preflight, "並行預查");
  if (!source.includes("const eligiblePromotions")) {
    source = source.replace(
      "  const baseTotal = money(computedBeforeOffers.reduce((sum, item) => sum + item.gross, 0));",
      "  const baseTotal = money(computedBeforeOffers.reduce((sum, item) => sum + item.gross, 0));\n  const eligiblePromotions = preloadedPromotions.filter((item: any) => Number(item.minSpend) <= baseTotal);",
    );
  }

  source = replaceExact(source,
    `    const soNumber = await nextNumberFastInTransaction(tx, "SO", tenantId);\n    const paymentNumber = await nextNumberFastInTransaction(tx, "RP", tenantId);\n    const posNumber = await nextNumberFastInTransaction(tx, "POS", tenantId);`,
    `    const numbers = await nextNumbersFastInTransaction(tx, ["SO", "RP", "POS", "JE"], tenantId);\n    const soNumber = numbers.SO;\n    const paymentNumber = numbers.RP;\n    const posNumber = numbers.POS;`,
    "批次單號");

  source = replaceExact(source,
    `    const customer = body.customerId\n      ? await tx.customer.findFirst({ where: { id: body.customerId, tenantId, isActive: true }, select: { id: true } })\n      : await tx.customer.upsert({ where: { tenantId_code: { tenantId, code: "POS-WALKIN" } }, update: { isActive: true }, create: { tenantId, code: "POS-WALKIN", companyName: "門市散客" }, select: { id: true } });`,
    `    const customer = body.customerId\n      ? await tx.customer.findFirst({ where: { id: body.customerId, tenantId, isActive: true }, select: { id: true } })\n      : { id: walkInCustomerId! };`,
    "散客快取");

  source = source.replace(
    "const offers = await resolveCheckoutOffers(tx, { tenantId, customerId: body.customerId ? customer.id : null, baseTotal, promotionId: body.promotionId, couponCode: body.couponCode, redeemPoints: body.redeemPoints });",
    "const offers = await resolveCheckoutOffers(tx, { tenantId, customerId: body.customerId ? customer.id : null, baseTotal, promotionId: body.promotionId, couponCode: body.couponCode, redeemPoints: body.redeemPoints, promotions: eligiblePromotions });",
  );

  const nestedWrite = `    const order = await tx.salesOrder.create({\n      data: {\n        tenantId, number: soNumber, customerId: customer.id, warehouseId: activeShift.register.warehouseId,\n        status: "POSTED", subtotal, discount: 0, taxAmount, total, isTaxable: true, shippedAt: new Date(), remark: \`POS \\${posNumber}\`, updatedBy: currentUser,\n        items: { create: computed.map((item) => ({ productId: item.productId, quantity: item.quantity, shippedQty: item.quantity, unitPrice: item.net / item.quantity, discount: 0, taxRate: item.rate, subtotal: item.net })) },\n        receivables: { create: { tenantId, customerId: customer.id, amount: total, paidAmount: total, status: "PAID", updatedBy: currentUser, payments: { create: { tenantId, number: paymentNumber, customerId: customer.id, amount: total, method: body.payments.length > 1 ? "MIXED" : body.payments[0].method, remark: \`POS \\${posNumber}\`, updatedBy: currentUser } } } },\n        posSale: { create: {\n          tenantId, clientRequestId: body.requestId, shiftId: activeShift.id, registerId: activeShift.registerId, customerId: customer.id,\n          exchangeRefundId: body.exchangeRefundId || null, promotionId: offers.promotion?.id || null, number: posNumber, receiptNo: posNumber,\n          subtotal, discount, promotionDiscount: offers.promotionDiscount, couponDiscount: offers.couponDiscount, pointsDiscount: offers.pointsDiscount,\n          loyaltyPointsRedeemed: offers.pointsRedeemed, loyaltyPointsEarned: pointsEarned, taxAmount, total, paidAmount: total, changeDue,\n          items: { create: computed.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: Number(item.product.salePrice), unitCost: Number(item.product.costPrice), discount: item.totalLineDiscount, taxRate: item.rate, subtotal: item.gross })) },\n          payments: { create: drawerPayments.filter((item) => item.amount > 0).map((item) => ({ method: item.method, amount: item.amount, reference: item.reference })) },\n        } },\n      },\n      include: { posSale: body.invoice ? { include: { items: { include: { product: true } }, payments: true } } : { include: { payments: true } } },\n    });\n    const sale = order.posSale!;\n\n`;
  source = replaceRange(source, "    const order = await tx.salesOrder.create({ data:", "    if (restaurantOrder) {", nestedWrite, "單次巢狀銷售寫入");

  source = replaceExact(source,
    `    if (restaurantOrder) {\n      await tx.restaurantOrder.update({ where: { id: restaurantOrder.id }, data: { status: "COMPLETED", posSaleId: sale.id, completedAt: new Date() } });\n      await tx.restaurantTable.update({ where: { id: restaurantOrder.tableId }, data: { status: "AVAILABLE" } });\n    }`,
    `    if (restaurantOrder) {\n      await tx.$executeRaw\`\n        WITH completed AS (\n          UPDATE "RestaurantOrder" SET "status" = 'COMPLETED', "posSaleId" = \\${sale.id}, "completedAt" = NOW(), "updatedAt" = NOW()\n          WHERE "id" = \\${restaurantOrder.id} RETURNING "tableId"\n        )\n        UPDATE "RestaurantTable" AS table_row SET "status" = 'AVAILABLE', "updatedAt" = NOW()\n        FROM completed WHERE table_row."id" = completed."tableId"\n      \`;\n    }`,
    "餐桌單次完成");

  const journalCall = `    await createCheckoutJournal(tx, {\n      tenantId, userId: session.user.id, journalNumber: numbers.JE, saleNumber: posNumber,\n      lines: [\n        ...drawerPayments.filter((item) => item.amount > 0).map((item) => ({ code: item.method === "CASH" ? "1101" : "1103", debit: item.amount, memo: \`\\${item.method} 收款－\\${posNumber}\` })),\n        { code: "4101", credit: subtotal, memo: \`銷貨收入－\\${posNumber}\` },\n        { code: "2111", credit: taxAmount, memo: \`銷項稅額－\\${posNumber}\` },\n        { code: "5101", debit: cogs, memo: \`銷貨成本－\\${posNumber}\` },\n        { code: "1201", credit: cogs, memo: \`存貨－\\${posNumber}\` },\n      ],\n    });\n`;
  source = replaceRange(source, "    await createCheckoutJournals(tx, {", "    return { sale, replayed:", journalCall, "單張即時傳票");
  write(path, source);
}

// 4. Make ERP/store switching visible for ecommerce tenants and platform demo.
{
  const path = "src/lib/storefront-access.ts";
  let source = read(path);
  if (!source.includes("export function canAccessTenantErp")) {
    const start = source.indexOf("export function isTenantHighestPrivilege");
    if (start < 0) throw new Error("找不到 storefront access 函式");
    const replacement = `export function isTenantHighestPrivilege(user: StorefrontAccessUser | null | undefined) {\n  return Boolean(user && !user.isSuperAdmin && Array.isArray(user.permissions) && user.permissions.includes("*"));\n}\n\nexport function canAccessTenantErp(user: StorefrontAccessUser | null | undefined) {\n  if (!user || user.isSuperAdmin || normalizeBusinessMode(user.businessMode) !== "ECOMMERCE") return false;\n  const permissions = Array.isArray(user.permissions) ? user.permissions : [];\n  return permissions.includes("*") || ["dashboard.view", "sales.view", "products.view", "inventory.view"].some((code) => permissions.includes(code));\n}\n\nexport function tenantStorefrontPath(user: StorefrontAccessUser | null | undefined) {\n  if (!canAccessTenantErp(user)) return null;\n  const tenantKey = user?.companyCode?.trim() || user?.tenantId?.trim();\n  return tenantKey ? \`/store/\\${encodeURIComponent(tenantKey)}\` : null;\n}\n\nexport function canManageTenantStorefront(user: StorefrontAccessUser | null | undefined, requestedTenant: string) {\n  const requested = normalizedTenantKey(requestedTenant);\n  if (!requested || !user) return false;\n  if (user.isSuperAdmin) return ["ATELIER-NOIR", "MOON-FORM"].includes(requested);\n  if (!tenantStorefrontPath(user)) return false;\n  return [user.tenantId, user.companyCode].map(normalizedTenantKey).filter(Boolean).includes(requested);\n}\n`;
    source = `${source.slice(0, start)}${replacement}`;
  }
  write(path, source);
}

{
  const path = "src/app/store/[tenant]/[[...view]]/page.tsx";
  let source = read(path);
  source = replaceExact(source,
    `  const managerAccess = canManageTenantStorefront(session?.user, tenant);\n  return <FashionStorefront tenant={tenant} initialView={view[0] || "home"} managerAccess={managerAccess} />;`,
    `  const managerAccess = canManageTenantStorefront(session?.user, tenant);\n  const managerBackHref = session?.user?.isSuperAdmin ? "/admin" : "/products";\n  const managerErpHref = session?.user?.isSuperAdmin ? "/workspace" : "/dashboard";\n  return <FashionStorefront tenant={tenant} initialView={view[0] || "home"} managerAccess={managerAccess} managerBackHref={managerBackHref} managerErpHref={managerErpHref} />;`,
    "商城切換 props");
  write(path, source);
}

{
  const path = "src/app/store/[tenant]/[[...view]]/storefront.tsx";
  let source = read(path);
  source = source.replace(
    "export function FashionStorefront({ tenant, initialView, managerAccess = false }: { tenant: string; initialView: string; managerAccess?: boolean }) {",
    "export function FashionStorefront({ tenant, initialView, managerAccess = false, managerBackHref = \"/products\", managerErpHref = \"/dashboard\" }: { tenant: string; initialView: string; managerAccess?: boolean; managerBackHref?: string; managerErpHref?: string }) {",
  );
  source = source.replace(
    '<Link href="/products"><ArrowLeft size={16} />回到電商後台</Link>\n            <Link href="/dashboard"><BarChart3 size={16} />進入 ERP</Link>',
    '<Link href={managerBackHref}><ArrowLeft size={16} />{managerBackHref === "/admin" ? "回平台管理" : "回到電商後台"}</Link>\n            <Link href={managerErpHref}><BarChart3 size={16} />切換 ERP</Link>',
  );
  write(path, source);
}

{
  const path = "src/app/(app)/workspace/page.tsx";
  let source = read(path);
  source = source.replace(
    '    if ((mode === "ERP" || mode === "ECOMMERCE") && hasPermission(permissions, "dashboard.view")) redirect("/dashboard");',
    '    if (mode === "ERP" && hasPermission(permissions, "dashboard.view")) redirect("/dashboard");',
  );
  if (!source.includes('title: "進入 ERP 營運後台"')) {
    const marker = '      : []),\n    ...((mode === "POS_RETAIL" || isPlatformAdmin)';
    const addition = '      : []),\n    ...((mode === "ECOMMERCE" || isPlatformAdmin) && hasPermission(permissions, "dashboard.view")\n      ? [{ title: "進入 ERP 營運後台", description: "網路訂單、商品、庫存、出貨、應收與會計整合管理", href: "/dashboard", icon: Building2, tone: "indigo" }]\n      : []),\n    ...((mode === "POS_RETAIL" || isPlatformAdmin)';
    source = replaceExact(source, marker, addition, "ERP 工作區卡片");
  }
  write(path, source);
}

{
  const path = "src/app/admin/page.tsx";
  let source = read(path);
  source = source.replace(
    "Loader2, LogOut, Mail, MonitorSmartphone, RefreshCw, Search, Shield, ShoppingBag, Store, Users, X, UtensilsCrossed, Download,",
    "Loader2, LogOut, Mail, MonitorSmartphone, RefreshCw, Search, Shield, ShoppingBag, Store, Users, X, UtensilsCrossed, Download, PanelsTopLeft,",
  );
  source = source.replace(
    '<Link href="/dashboard" className="admin-button bg-indigo-600 hover:bg-indigo-500"><LayoutDashboard className="h-4 w-4" />一般企業 ERP 後台</Link>',
    '<Link href="/workspace" className="admin-button bg-indigo-600 hover:bg-indigo-500"><PanelsTopLeft className="h-4 w-4" />切換 ERP／電商工作區</Link>',
  );
  write(path, source);
}

// 5. Static safeguards run before TypeScript/build.
writeFileSync("scripts/verify-checkout-commerce-optimizations.mjs", `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nconst numbers = readFileSync("src/lib/number-sequence.ts", "utf8");\nconst checkout = readFileSync("src/app/api/pos/checkout/route.ts", "utf8");\nconst workspace = readFileSync("src/app/(app)/workspace/page.tsx", "utf8");\nconst access = readFileSync("src/lib/storefront-access.ts", "utf8");\nconst store = readFileSync("src/app/store/[tenant]/[[...view]]/storefront.tsx", "utf8");\nconst admin = readFileSync("src/app/admin/page.tsx", "utf8");\nassert.match(numbers, /nextNumbersFastInTransaction/);\nassert.match(checkout, /\["SO", "RP", "POS", "JE"\]/);\nassert.match(checkout, /receivables:\s*\{\s*create:/);\nassert.match(checkout, /posSale:\s*\{\s*create:/);\nassert.match(checkout, /POS 即時銷售與收款/);\nassert.doesNotMatch(checkout, /createCheckoutJournals/);\nassert.match(checkout, /WITH completed AS/);\nassert.doesNotMatch(workspace, /mode === "ERP" \|\| mode === "ECOMMERCE"/);\nassert.match(workspace, /進入 ERP 營運後台/);\nassert.match(access, /canAccessTenantErp/);\nassert.match(store, /切換 ERP/);\nassert.match(admin, /切換 ERP／電商工作區/);\nconsole.log("Checkout round-trip reduction and ecommerce ERP switching: PASS");\n`);

const packagePath = "package.json";
const packageJson = JSON.parse(read(packagePath));
packageJson.scripts["test:speed"] = "node scripts/verify-speed-patch.mjs && node scripts/verify-checkout-commerce-optimizations.mjs";
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log("Checkout and commerce v2 patch completed.");
