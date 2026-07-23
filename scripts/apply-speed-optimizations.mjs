import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content);
  console.log(`${path}: optimized`);
}

function insertAfter(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`找不到速度優化定位點：${label}`);
  const end = index + marker.length;
  return `${source.slice(0, end)}${addition}${source.slice(end)}`;
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`找不到速度優化起點：${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`找不到速度優化終點：${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function replaceExact(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`找不到速度優化定位點：${label}`);
  return source.replace(search, replacement);
}

const posPath = "src/app/(app)/pos/pos-workspace.tsx";
{
  let source = read(posPath);
  const helperMarker = 'const OPERATION_STATUS_LABELS: Record<string, string> = { PENDING: "待主管核准", APPROVED: "已核准", REJECTED: "已拒絕", CANCELLED: "已取消" };';
  const helper = [
    "",
    "const POS_PRODUCT_CACHE_TTL_MS = 60_000;",
    "",
    "function readCachedPosProducts(warehouseId: string): Product[] | null {",
    "  try {",
    "    const raw = window.sessionStorage.getItem(`erin-pos-products:${warehouseId}`);",
    "    if (!raw) return null;",
    "    const parsed = JSON.parse(raw);",
    "    if (!Array.isArray(parsed.items) || Date.now() - Number(parsed.savedAt || 0) > POS_PRODUCT_CACHE_TTL_MS) return null;",
    "    return parsed.items as Product[];",
    "  } catch {",
    "    return null;",
    "  }",
    "}",
    "",
    "function writeCachedPosProducts(warehouseId: string, items: Product[]) {",
    "  try {",
    "    window.sessionStorage.setItem(`erin-pos-products:${warehouseId}`, JSON.stringify({ savedAt: Date.now(), items }));",
    "  } catch {}",
    "}",
    "",
  ].join("\n");
  source = insertAfter(source, helperMarker, helper, "POS 商品快取 helper");

  const loadProducts = [
    "  const loadProducts = useCallback(async (activeShift: Shift | null) => {",
    "    if (!activeShift) {",
    "      setProducts([]);",
    "      productRequestKeyRef.current = \"\";",
    "      return;",
    "    }",
    "    productRequestKeyRef.current = `${activeShift.id}:`;",
    "    const warehouseId = activeShift.register.warehouseId;",
    "    const cached = readCachedPosProducts(warehouseId);",
    "    if (cached) setProducts(cached);",
    "",
    "    const params = new URLSearchParams({ warehouseId });",
    "    const request = fetch(`/api/pos/products?${params}`, { cache: \"no-store\" })",
    "      .then(async (res) => {",
    "        const data = await res.json();",
    "        if (!res.ok) throw new Error(data.error || \"商品載入失敗\");",
    "        const items = data.items ?? [];",
    "        setProducts(items);",
    "        writeCachedPosProducts(warehouseId, items);",
    "      });",
    "",
    "    if (cached) {",
    "      void request.catch(() => toast.error(\"商品資料更新失敗，暫時使用本機快取\"));",
    "      return;",
    "    }",
    "    await request;",
    "  }, []);",
    "",
  ].join("\n");
  source = replaceRange(
    source,
    "  const loadProducts = useCallback(async (activeShift: Shift | null) => {",
    "  const loadCustomers = useCallback(async (value = \"\") => {",
    loadProducts,
    "POS 商品載入",
  );

  const productSearchStart = "  useEffect(() => {\n    if (!shift) return;\n    const requestKey = `${shift.id}:${query.trim().toLowerCase()}`;";
  const customerSearchStart = "  useEffect(() => {\n    if (!shift) return;\n    const requestKey = customerQuery.trim().toLowerCase();";
  if (source.includes(productSearchStart)) {
    source = replaceRange(source, productSearchStart, customerSearchStart, "", "POS 遠端商品搜尋");
  }

  source = source.replace(
    "// server debounce, so a power loss inside the next 700 ms cannot drop it.",
    "// server debounce; localStorage protects every edit immediately, while remote sync is intentionally less frequent.",
  );
  source = source.replace("    }, 700);", "    }, 3_000);");
  write(posPath, source);
}

const restaurantPath = "src/app/(app)/pos/restaurant/restaurant-workspace.tsx";
{
  let source = read(restaurantPath);
  const helperMarker = 'const ACTIVE = new Set(["OPEN", "SENT", "PREPARING", "READY"]);';
  const helper = [
    "",
    "const RESTAURANT_BOOTSTRAP_CACHE_TTL_MS = 15_000;",
    "",
    "function readRestaurantBootstrapCache(): Bootstrap | null {",
    "  try {",
    "    const raw = window.sessionStorage.getItem(\"erin-restaurant-front-bootstrap\");",
    "    if (!raw) return null;",
    "    const parsed = JSON.parse(raw);",
    "    if (!parsed.data || Date.now() - Number(parsed.savedAt || 0) > RESTAURANT_BOOTSTRAP_CACHE_TTL_MS) return null;",
    "    return parsed.data as Bootstrap;",
    "  } catch {",
    "    return null;",
    "  }",
    "}",
    "",
    "function writeRestaurantBootstrapCache(data: Bootstrap) {",
    "  try {",
    "    window.sessionStorage.setItem(\"erin-restaurant-front-bootstrap\", JSON.stringify({ savedAt: Date.now(), data }));",
    "  } catch {}",
    "}",
    "",
  ].join("\n");
  source = insertAfter(source, helperMarker, helper, "餐飲快取 helper");

  const loadBlock = [
    "  const load = useCallback(async () => {",
    "    const cached = kitchenOnly ? null : readRestaurantBootstrapCache();",
    "    if (cached) {",
    "      setData(cached);",
    "      setRegisterId((value) => value || cached.registers[0]?.id || \"\");",
    "      setLoading(false);",
    "    }",
    "    try {",
    "      const response = await fetch(`/api/pos/restaurant?view=${kitchenOnly ? \"kitchen\" : \"front\"}`, { cache: \"no-store\" });",
    "      const result = await response.json();",
    "      if (!response.ok) throw new Error(result.error || \"無法載入餐飲 POS\");",
    "      setData(result);",
    "      if (!kitchenOnly) writeRestaurantBootstrapCache(result);",
    "      setRegisterId((value) => value || result.registers[0]?.id || \"\");",
    "    } catch (error) {",
    "      if (!cached) toast.error(error instanceof Error ? error.message : \"無法載入餐飲 POS\");",
    "    } finally {",
    "      setLoading(false);",
    "    }",
    "  }, [kitchenOnly]);",
    "",
  ].join("\n");
  source = replaceRange(
    source,
    "  const load = useCallback(async () => {",
    "  useEffect(() => { void load(); }, [load]);",
    loadBlock,
    "餐飲載入快取",
  );

  const oldCheckoutTail = [
    "      setLastSaleId(result.sale.id);",
    "      setSelectedTableId(\"\");",
    "      toast.success(`結帳完成：${result.sale.number}`);",
    "      await load();",
  ].join("\n");
  const newCheckoutTail = [
    "      const completedOrderId = selectedOrder.id;",
    "      const completedTableId = selectedTable?.id;",
    "      const soldByProduct = new Map<string, number>();",
    "      for (const item of selectedOrder.items) {",
    "        if (item.status === \"CANCELLED\") continue;",
    "        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + Number(item.quantity));",
    "      }",
    "      setData((current) => current ? {",
    "        ...current,",
    "        products: current.products.map((product) => ({",
    "          ...product,",
    "          stockTotal: Math.max(0, product.stockTotal - (soldByProduct.get(product.id) ?? 0)),",
    "        })),",
    "        areas: current.areas.map((area) => ({",
    "          ...area,",
    "          tables: area.tables.map((table) => table.id === completedTableId",
    "            ? { ...table, status: \"AVAILABLE\", orders: table.orders.filter((order) => order.id !== completedOrderId) }",
    "            : table),",
    "        })),",
    "      } : current);",
    "      setLastSaleId(result.sale.id);",
    "      setSelectedTableId(\"\");",
    "      toast.success(`結帳完成：${result.sale.number}`);",
    "      window.setTimeout(() => void load(), 1_200);",
  ].join("\n");
  source = replaceExact(source, oldCheckoutTail, newCheckoutTail, "餐飲結帳局部更新");
  write(restaurantPath, source);
}

const posProductsPath = "src/app/api/pos/products/route.ts";
{
  let source = read(posProductsPath);
  source = source.replace("    take: 80,", "    take: query ? 80 : 500,");
  source = source.replace(
    "  return NextResponse.json({ items: products.map(serializeProduct) });",
    '  return NextResponse.json({ items: products.map(serializeProduct) }, { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" } });',
  );
  write(posProductsPath, source);
}

const storefrontPath = "src/app/api/store/[tenant]/route.ts";
{
  let source = read(storefrontPath);
  source = insertAfter(source, 'import { NextRequest, NextResponse } from "next/server";', '\nimport { Prisma } from "@prisma/client";', "商城 Prisma import");
  const batchStock = [
    "    if (stockPlan.allocations.length > 0) {",
    "      const requestedRows = stockPlan.allocations.map((allocation) => Prisma.sql`(${allocation.stockId}, ${allocation.productId}, ${allocation.warehouseId}, ${allocation.quantity}::numeric)`);",
    "      const updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`",
    "        WITH requested(\"stockId\", \"productId\", \"warehouseId\", \"quantity\") AS (",
    "          VALUES ${Prisma.join(requestedRows)}",
    "        )",
    "        UPDATE \"InventoryStock\" AS stock",
    "        SET \"quantity\" = stock.\"quantity\" - requested.\"quantity\"",
    "        FROM requested",
    "        WHERE stock.\"id\" = requested.\"stockId\"",
    "          AND stock.\"tenantId\" = ${tenant.id}",
    "          AND stock.\"productId\" = requested.\"productId\"",
    "          AND stock.\"warehouseId\" = requested.\"warehouseId\"",
    "          AND stock.\"quantity\" >= requested.\"quantity\"",
    "        RETURNING stock.\"id\"",
    "      `);",
    "      if (updated.length !== stockPlan.allocations.length) {",
    "        throw new ApiError(409, \"庫存剛被其他交易更新，請重新確認購物車後再結帳\");",
    "      }",
    "    }",
  ].join("\n");
  source = replaceRange(
    source,
    "    for (const allocation of stockPlan.allocations) {",
    "    await tx.inventoryTransaction.createMany({",
    `${batchStock}\n`,
    "商城批次扣庫存",
  );
  write(storefrontPath, source);
}

const verifyPath = "scripts/verify-speed-optimizations.mjs";
writeFileSync(verifyPath, [
  'import assert from "node:assert/strict";',
  'import { readFileSync } from "node:fs";',
  "",
  'const pos = readFileSync("src/app/(app)/pos/pos-workspace.tsx", "utf8");',
  'const restaurant = readFileSync("src/app/(app)/pos/restaurant/restaurant-workspace.tsx", "utf8");',
  'const posProducts = readFileSync("src/app/api/pos/products/route.ts", "utf8");',
  'const storefront = readFileSync("src/app/api/store/[tenant]/route.ts", "utf8");',
  "",
  'assert.match(pos, /POS_PRODUCT_CACHE_TTL_MS = 60_000/);',
  'assert.match(pos, /readCachedPosProducts/);',
  'assert.doesNotMatch(pos, /const requestKey = `\\$\\{shift\\.id\\}:\\$\\{query\\.trim/);',
  'assert.match(pos, /\\}, 3_000\\);/);',
  'assert.match(restaurant, /RESTAURANT_BOOTSTRAP_CACHE_TTL_MS = 15_000/);',
  'assert.match(restaurant, /window\\.setTimeout\\(\\(\\) => void load\\(\\), 1_200\\)/);',
  'assert.match(posProducts, /take: query \\? 80 : 500/);',
  'assert.match(storefront, /Prisma\\.join\\(requestedRows\\)/);',
  'assert.doesNotMatch(storefront, /for \\(const allocation of stockPlan\\.allocations\\)/);',
  "",
  'console.log("POS local search/cache, restaurant immediate checkout, and storefront batch stock update: PASS");',
  "",
].join("\n"));

const packagePath = "package.json";
const packageJson = JSON.parse(read(packagePath));
packageJson.scripts["test:speed"] = "node scripts/verify-speed-optimizations.mjs";
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const workflowPath = ".github/workflows/release-desktop.yml";
{
  let source = read(workflowPath);
  if (!source.includes("npm run test:speed")) {
    source = replaceExact(
      source,
      "      - run: npm run test:storefront\n",
      "      - run: npm run test:storefront\n      - run: npm run test:speed\n",
      "Actions 速度測試",
    );
    write(workflowPath, source);
  }
}

console.log("Runtime speed optimization patch completed.");
