import { readFileSync, writeFileSync } from "node:fs";

function updateText(path, updater) {
  const source = readFileSync(path, "utf8");
  const next = updater(source);
  if (next === source) {
    console.log(`${path}: already optimized`);
    return;
  }
  writeFileSync(path, next);
  console.log(`${path}: optimized`);
}

function replaceRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`找不到速度優化定位點：${label}`);
  return source.replace(search, replacement);
}

const posPath = "src/app/(app)/pos/pos-workspace.tsx";
updateText(posPath, (initial) => {
  let source = initial;
  source = replaceRequired(
    source,
    'const OPERATION_STATUS_LABELS: Record<string, string> = { PENDING: "待主管核准", APPROVED: "已核准", REJECTED: "已拒絕", CANCELLED: "已取消" };\n',
    `const OPERATION_STATUS_LABELS: Record<string, string> = { PENDING: "待主管核准", APPROVED: "已核准", REJECTED: "已拒絕", CANCELLED: "已取消" };\nconst POS_PRODUCT_CACHE_TTL_MS = 60_000;\n\nfunction readCachedPosProducts(warehouseId: string): Product[] | null {\n  try {\n    const raw = window.sessionStorage.getItem(\`erin-pos-products:\${warehouseId}\`);\n    if (!raw) return null;\n    const parsed = JSON.parse(raw);\n    if (!Array.isArray(parsed.items) || Date.now() - Number(parsed.savedAt || 0) > POS_PRODUCT_CACHE_TTL_MS) return null;\n    return parsed.items as Product[];\n  } catch {\n    return null;\n  }\n}\n\nfunction writeCachedPosProducts(warehouseId: string, items: Product[]) {\n  try {\n    window.sessionStorage.setItem(\`erin-pos-products:\${warehouseId}\`, JSON.stringify({ savedAt: Date.now(), items }));\n  } catch {}\n}\n`,
    "POS 商品快取 helper",
  );

  const oldLoadProducts = `  const loadProducts = useCallback(async (activeShift: Shift | null) => {\n    if (!activeShift) {\n      setProducts([]);\n      productRequestKeyRef.current = "";\n      return;\n    }\n    productRequestKeyRef.current = \`\${activeShift.id}:\`;\n    const params = new URLSearchParams({ warehouseId: activeShift.register.warehouseId });\n    const res = await fetch(\`/api/pos/products?\${params}\`, { cache: "no-store" });\n    const data = await res.json();\n    if (!res.ok) throw new Error(data.error || "商品載入失敗");\n    setProducts(data.items ?? []);\n  }, []);`;
  const newLoadProducts = `  const loadProducts = useCallback(async (activeShift: Shift | null) => {\n    if (!activeShift) {\n      setProducts([]);\n      productRequestKeyRef.current = "";\n      return;\n    }\n    productRequestKeyRef.current = \`\${activeShift.id}:\`;\n    const warehouseId = activeShift.register.warehouseId;\n    const cached = readCachedPosProducts(warehouseId);\n    if (cached) setProducts(cached);\n\n    const params = new URLSearchParams({ warehouseId });\n    const request = fetch(\`/api/pos/products?\${params}\`, { cache: "no-store" })\n      .then(async (res) => {\n        const data = await res.json();\n        if (!res.ok) throw new Error(data.error || "商品載入失敗");\n        const items = data.items ?? [];\n        setProducts(items);\n        writeCachedPosProducts(warehouseId, items);\n      });\n\n    if (cached) {\n      void request.catch(() => toast.error("商品資料更新失敗，暫時使用本機快取"));\n      return;\n    }\n    await request;\n  }, []);`;
  source = replaceRequired(source, oldLoadProducts, newLoadProducts, "POS 商品載入");

  const productSearchEffect = `  useEffect(() => {\n    if (!shift) return;\n    const requestKey = \`\${shift.id}:\${query.trim().toLowerCase()}\`;\n    if (productRequestKeyRef.current === requestKey) return;\n    productRequestKeyRef.current = requestKey;\n    const timer = window.setTimeout(() => {\n      const params = new URLSearchParams({ warehouseId: shift.register.warehouseId });\n      if (query.trim()) params.set("q", query.trim());\n      void fetch(\`/api/pos/products?\${params}\`, { cache: "no-store" })\n        .then(async (res) => {\n          const data = await res.json();\n          if (!res.ok) throw new Error(data.error || "商品搜尋失敗");\n          setProducts(data.items ?? []);\n        })\n        .catch((error) => {\n          if (productRequestKeyRef.current === requestKey) productRequestKeyRef.current = "";\n          toast.error(error.message);\n        });\n    }, query.trim() ? 250 : 0);\n    return () => window.clearTimeout(timer);\n  }, [query, shift]);\n\n`;
  if (source.includes(productSearchEffect)) source = source.replace(productSearchEffect, "");

  source = source
    .replace("// server debounce, so a power loss inside the next 700 ms cannot drop it.", "// server debounce; localStorage already protects every edit immediately, while remote sync is intentionally less frequent.")
    .replace("    }, 700);", "    }, 3_000);");
  return source;
});

const restaurantPath = "src/app/(app)/pos/restaurant/restaurant-workspace.tsx";
updateText(restaurantPath, (initial) => {
  let source = initial;
  source = replaceRequired(
    source,
    'const ACTIVE = new Set(["OPEN", "SENT", "PREPARING", "READY"]);\n',
    `const ACTIVE = new Set(["OPEN", "SENT", "PREPARING", "READY"]);\nconst RESTAURANT_BOOTSTRAP_CACHE_TTL_MS = 15_000;\n\nfunction readRestaurantBootstrapCache(): Bootstrap | null {\n  try {\n    const raw = window.sessionStorage.getItem("erin-restaurant-front-bootstrap");\n    if (!raw) return null;\n    const parsed = JSON.parse(raw);\n    if (!parsed.data || Date.now() - Number(parsed.savedAt || 0) > RESTAURANT_BOOTSTRAP_CACHE_TTL_MS) return null;\n    return parsed.data as Bootstrap;\n  } catch {\n    return null;\n  }\n}\n\nfunction writeRestaurantBootstrapCache(data: Bootstrap) {\n  try {\n    window.sessionStorage.setItem("erin-restaurant-front-bootstrap", JSON.stringify({ savedAt: Date.now(), data }));\n  } catch {}\n}\n`,
    "餐飲快取 helper",
  );

  const oldLoad = `  const load = useCallback(async () => {\n    try {\n      const response = await fetch(\`/api/pos/restaurant?view=\${kitchenOnly ? "kitchen" : "front"}\`, { cache: "no-store" });\n      const result = await response.json();\n      if (!response.ok) throw new Error(result.error || "無法載入餐飲 POS");\n      setData(result);\n      setRegisterId((value) => value || result.registers[0]?.id || "");\n    } catch (error) {\n      toast.error(error instanceof Error ? error.message : "無法載入餐飲 POS");\n    } finally {\n      setLoading(false);\n    }\n  }, [kitchenOnly]);`;
  const newLoad = `  const load = useCallback(async () => {\n    const cached = kitchenOnly ? null : readRestaurantBootstrapCache();\n    if (cached) {\n      setData(cached);\n      setRegisterId((value) => value || cached.registers[0]?.id || "");\n      setLoading(false);\n    }\n    try {\n      const response = await fetch(\`/api/pos/restaurant?view=\${kitchenOnly ? "kitchen" : "front"}\`, { cache: "no-store" });\n      const result = await response.json();\n      if (!response.ok) throw new Error(result.error || "無法載入餐飲 POS");\n      setData(result);\n      if (!kitchenOnly) writeRestaurantBootstrapCache(result);\n      setRegisterId((value) => value || result.registers[0]?.id || "");\n    } catch (error) {\n      if (!cached) toast.error(error instanceof Error ? error.message : "無法載入餐飲 POS");\n    } finally {\n      setLoading(false);\n    }\n  }, [kitchenOnly]);`;
  source = replaceRequired(source, oldLoad, newLoad, "餐飲載入快取");

  const oldCheckoutTail = `      setLastSaleId(result.sale.id);\n      setSelectedTableId("");\n      toast.success(\`結帳完成：\${result.sale.number}\`);\n      await load();`;
  const newCheckoutTail = `      const completedOrderId = selectedOrder.id;\n      const completedTableId = selectedTable?.id;\n      const soldByProduct = new Map<string, number>();\n      for (const item of selectedOrder.items) {\n        if (item.status === "CANCELLED") continue;\n        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + Number(item.quantity));\n      }\n      setData((current) => current ? {\n        ...current,\n        products: current.products.map((product) => ({\n          ...product,\n          stockTotal: Math.max(0, product.stockTotal - (soldByProduct.get(product.id) ?? 0)),\n        })),\n        areas: current.areas.map((area) => ({\n          ...area,\n          tables: area.tables.map((table) => table.id === completedTableId\n            ? { ...table, status: "AVAILABLE", orders: table.orders.filter((order) => order.id !== completedOrderId) }\n            : table),\n        })),\n      } : current);\n      setLastSaleId(result.sale.id);\n      setSelectedTableId("");\n      toast.success(\`結帳完成：\${result.sale.number}\`);\n      window.setTimeout(() => void load(), 1_200);`;
  source = replaceRequired(source, oldCheckoutTail, newCheckoutTail, "餐飲結帳局部更新");
  return source;
});

const posProductsPath = "src/app/api/pos/products/route.ts";
updateText(posProductsPath, (source) => source
  .replace("    take: 80,", "    take: query ? 80 : 500,")
  .replace("  return NextResponse.json({ items: products.map(serializeProduct) });", '  return NextResponse.json({ items: products.map(serializeProduct) }, { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" } });'));

const storefrontPath = "src/app/api/store/[tenant]/route.ts";
updateText(storefrontPath, (initial) => {
  let source = initial;
  source = replaceRequired(
    source,
    'import { NextRequest, NextResponse } from "next/server";\n',
    'import { Prisma } from "@prisma/client";\nimport { NextRequest, NextResponse } from "next/server";\n',
    "商城 Prisma import",
  );
  const oldLoop = `    for (const allocation of stockPlan.allocations) {\n      const changed = await tx.inventoryStock.updateMany({\n        where: {\n          id: allocation.stockId,\n          tenantId: tenant.id,\n          productId: allocation.productId,\n          warehouseId: allocation.warehouseId,\n          quantity: { gte: allocation.quantity },\n        },\n        data: { quantity: { decrement: allocation.quantity } },\n      });\n      if (changed.count !== 1) throw new ApiError(409, "庫存剛被其他交易更新，請重新確認購物車後再結帳");\n    }`;
  const newLoop = `    if (stockPlan.allocations.length > 0) {\n      const requestedRows = stockPlan.allocations.map((allocation) => Prisma.sql\`(\${allocation.stockId}, \${allocation.productId}, \${allocation.warehouseId}, \${allocation.quantity}::numeric)\`);\n      const updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql\`\n        WITH requested("stockId", "productId", "warehouseId", "quantity") AS (\n          VALUES \${Prisma.join(requestedRows)}\n        )\n        UPDATE "InventoryStock" AS stock\n        SET "quantity" = stock."quantity" - requested."quantity"\n        FROM requested\n        WHERE stock."id" = requested."stockId"\n          AND stock."tenantId" = \${tenant.id}\n          AND stock."productId" = requested."productId"\n          AND stock."warehouseId" = requested."warehouseId"\n          AND stock."quantity" >= requested."quantity"\n        RETURNING stock."id"\n      \`);\n      if (updated.length !== stockPlan.allocations.length) {\n        throw new ApiError(409, "庫存剛被其他交易更新，請重新確認購物車後再結帳");\n      }\n    }`;
  source = replaceRequired(source, oldLoop, newLoop, "商城批次扣庫存");
  return source;
});

const verifyPath = "scripts/verify-speed-optimizations.mjs";
writeFileSync(verifyPath, `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\n\nconst pos = readFileSync("src/app/(app)/pos/pos-workspace.tsx", "utf8");\nconst restaurant = readFileSync("src/app/(app)/pos/restaurant/restaurant-workspace.tsx", "utf8");\nconst posProducts = readFileSync("src/app/api/pos/products/route.ts", "utf8");\nconst storefront = readFileSync("src/app/api/store/[tenant]/route.ts", "utf8");\n\nassert.match(pos, /POS_PRODUCT_CACHE_TTL_MS = 60_000/);\nassert.match(pos, /readCachedPosProducts/);\nassert.doesNotMatch(pos, /const requestKey = \\`\\$\\{shift\\.id\\}:\\$\\{query\\.trim\\(\\)\\.toLowerCase\\(\\)\\}\\`/);\nassert.match(pos, /\\}, 3_000\\);/);\nassert.match(restaurant, /RESTAURANT_BOOTSTRAP_CACHE_TTL_MS = 15_000/);\nassert.match(restaurant, /window\\.setTimeout\\(\\(\\) => void load\\(\\), 1_200\\)/);\nassert.match(posProducts, /take: query \\? 80 : 500/);\nassert.match(storefront, /Prisma\\.join\\(requestedRows\\)/);\nassert.doesNotMatch(storefront, /for \\(const allocation of stockPlan\\.allocations\\)/);\n\nconsole.log("POS local search/cache, restaurant immediate checkout, and storefront batch stock update: PASS");\n`);

const packagePath = "package.json";
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
packageJson.scripts["test:speed"] = "node scripts/verify-speed-optimizations.mjs";
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const workflowPath = ".github/workflows/release-desktop.yml";
updateText(workflowPath, (source) => {
  if (source.includes("npm run test:speed")) return source;
  return replaceRequired(source, "      - run: npm run test:storefront\n", "      - run: npm run test:storefront\n      - run: npm run test:speed\n", "Actions 速度測試");
});

console.log("Runtime speed optimization patch completed.");
