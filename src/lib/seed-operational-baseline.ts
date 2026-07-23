type BusinessMode = "ERP" | "POS_RETAIL" | "POS_RESTAURANT" | "ECOMMERCE";

type BaselineProduct = {
  categoryCode: string;
  categoryName: string;
  sku: string;
  barcode?: string;
  name: string;
  cost: number;
  price: number;
  quantity: number;
  safetyStock: number;
  imageUrl?: string;
};

const ERP_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "ERP-DEMO", categoryName: "進銷存範例商品", sku: "ERP-P001", barcode: "4711000000015", name: "A4 影印紙（箱）", cost: 820, price: 1_050, quantity: 24, safetyStock: 5 },
  { categoryCode: "ERP-DEMO", categoryName: "進銷存範例商品", sku: "ERP-P002", barcode: "4711000000022", name: "人體工學辦公椅", cost: 2_800, price: 4_200, quantity: 12, safetyStock: 3 },
  { categoryCode: "ERP-DEMO", categoryName: "進銷存範例商品", sku: "ERP-P003", barcode: "4711000000039", name: "商用 24 吋螢幕", cost: 3_200, price: 4_680, quantity: 18, safetyStock: 4 },
];

const RETAIL_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "RETAIL-DEMO", categoryName: "門市熱銷商品", sku: "RTL-P001", barcode: "4712000000014", name: "純棉購物袋", cost: 80, price: 180, quantity: 50, safetyStock: 10 },
  { categoryCode: "RETAIL-DEMO", categoryName: "門市熱銷商品", sku: "RTL-P002", barcode: "4712000000021", name: "不鏽鋼保溫杯", cost: 220, price: 490, quantity: 36, safetyStock: 8 },
  { categoryCode: "RETAIL-DEMO", categoryName: "門市熱銷商品", sku: "RTL-P003", barcode: "4712000000038", name: "木質調香氛蠟燭", cost: 160, price: 360, quantity: 28, safetyStock: 6 },
];

const COMMERCE_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "EC-TOP", categoryName: "上身", sku: "EC-P001", barcode: "4713000000013", name: "雲感落肩襯衫", cost: 720, price: 1_680, quantity: 18, safetyStock: 5, imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-BOTTOM", categoryName: "下身", sku: "EC-P002", barcode: "4713000000020", name: "輪廓打褶寬褲", cost: 980, price: 2_280, quantity: 12, safetyStock: 4, imageUrl: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-KNIT", categoryName: "針織", sku: "EC-P003", barcode: "4713000000037", name: "日常織紋針織衫", cost: 760, price: 1_880, quantity: 24, safetyStock: 6, imageUrl: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-ACC", categoryName: "配件", sku: "EC-P004", barcode: "4713000000044", name: "方形皮革肩背包", cost: 1_120, price: 2_680, quantity: 12, safetyStock: 4, imageUrl: "https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-DRESS", categoryName: "洋裝", sku: "EC-P005", barcode: "4713000000051", name: "亞麻混紡長洋裝", cost: 1_280, price: 2_980, quantity: 9, safetyStock: 3, imageUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-SHOES", categoryName: "鞋履", sku: "EC-P006", barcode: "4713000000068", name: "極簡皮革休閒鞋", cost: 1_450, price: 3_280, quantity: 15, safetyStock: 4, imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=82" },
];
const RESTAURANT_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F001", name: "經典牛肉漢堡", cost: 80, price: 220, quantity: 60, safetyStock: 10, imageUrl: "/demo-products/burger.svg" },
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F002", name: "香蒜奶油義大利麵", cost: 65, price: 190, quantity: 60, safetyStock: 10, imageUrl: "/demo-products/pasta.svg" },
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F003", name: "松露脆薯", cost: 35, price: 120, quantity: 80, safetyStock: 15, imageUrl: "/demo-products/fries.svg" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D001", name: "拿鐵咖啡", cost: 30, price: 110, quantity: 80, safetyStock: 15, imageUrl: "/demo-products/latte.svg" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D002", name: "季節水果茶", cost: 28, price: 100, quantity: 80, safetyStock: 15, imageUrl: "/demo-products/tea.svg" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D003", name: "焦糖乳酪蛋糕", cost: 45, price: 130, quantity: 40, safetyStock: 8, imageUrl: "/demo-products/cake.svg" },
];

function normalizedMode(value: string | null | undefined): BusinessMode {
  if (value === "ECOMMERCE") return "ECOMMERCE";
  if (value === "POS_RESTAURANT") return "POS_RESTAURANT";
  if (value === "POS_RETAIL" || value === "POS") return "POS_RETAIL";
  return "ERP";
}

/**
 * 建立能直接操作的基礎資料，不覆寫使用者已修改的庫存與交易。
 * 商品、庫存與桌位使用 createMany 批次建立，固定代碼與 skipDuplicates
 * 讓初始化失敗後可安全重試。
 */
export async function seedOperationalBaseline(tx: any, input: {
  tenantId: string;
  tenantName: string;
  businessMode: string;
  isInternal: boolean;
  mainWarehouseId: string;
}) {
  const mode = normalizedMode(input.businessMode);
  const includeErp = input.isInternal || mode === "ERP";
  const includeRetail = input.isInternal || mode === "POS_RETAIL";
  const includeRestaurant = input.isInternal || mode === "POS_RESTAURANT";
  const includeCommerce = input.isInternal || mode === "ECOMMERCE";

  const tax = await tx.taxRate.findUnique({
    where: { tenantId_code: { tenantId: input.tenantId, code: "VAT5" } },
    select: { id: true },
  });
  const unit = await tx.productUnit.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "PCS" } },
    update: {},
    create: { tenantId: input.tenantId, code: "PCS", name: includeRestaurant && !includeErp && !includeRetail && !includeCommerce ? "份" : "個" },
  });

  await tx.warehouse.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "WH02" } },
    update: {},
    create: { tenantId: input.tenantId, code: "WH02", name: includeCommerce ? "電商備貨倉" : includeRetail || includeRestaurant ? "門市備用倉" : "備用倉庫" },
  });
  const customer = await tx.customer.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "C001" } },
    update: {},
    create: {
      tenantId: input.tenantId,
      code: "C001",
      companyName: includeCommerce ? "示範網路會員－王小姐" : includeRetail || includeRestaurant ? "示範會員－王小姐" : "範例客戶有限公司",
      contactName: "王小姐",
      phone: "0912-345-678",
      email: "demo-customer@example.com",
      paymentTerms: "月結 30 天",
      loyaltyPoints: includeRetail || includeRestaurant || includeCommerce ? 120 : 0,
      loyaltyTier: includeRetail || includeRestaurant || includeCommerce ? "GOLD" : "STANDARD",
      remark: "系統基礎資料，可自行修改或刪除",
    },
  });
  const supplier = await tx.supplier.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "S001" } },
    update: {},
    create: {
      tenantId: input.tenantId,
      code: "S001",
      companyName: "範例供應商有限公司",
      contactName: "林小姐",
      phone: "02-2345-6789",
      email: "demo-supplier@example.com",
      paymentTerms: "月結 30 天",
      remark: "系統基礎資料，可自行修改或刪除",
    },
  });
  await tx.cashAccount.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "CASH-01" } },
    update: {},
    create: { tenantId: input.tenantId, code: "CASH-01", name: "現金", balance: 0 },
  });
  await tx.bankAccount.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "BANK-01" } },
    update: {},
    create: { tenantId: input.tenantId, code: "BANK-01", name: "公司主要銀行帳戶", bankName: "示範銀行", accountNumber: "000-000-000000", balance: 0 },
  });

  const definitions = [
    ...(includeErp ? ERP_PRODUCTS : []),
    ...(includeRetail ? RETAIL_PRODUCTS : []),
    ...(includeRestaurant ? RESTAURANT_PRODUCTS : []),
    ...(includeCommerce ? COMMERCE_PRODUCTS : []),
  ];

  const categoryDefinitions = Array.from(
    new Map(definitions.map((definition) => [definition.categoryCode, {
      code: definition.categoryCode,
      name: definition.categoryName,
    }])).values(),
  );
  if (categoryDefinitions.length > 0) {
    await tx.productCategory.createMany({
      data: categoryDefinitions.map((category) => ({
        tenantId: input.tenantId,
        code: category.code,
        name: category.name,
      })),
      skipDuplicates: true,
    });
  }

  const categories = await tx.productCategory.findMany({
    where: {
      tenantId: input.tenantId,
      code: { in: categoryDefinitions.map((category) => category.code) },
    },
    select: { id: true, code: true },
  });
  const categoryIdByCode = new Map<string, string>(categories.map((category: any) => [category.code, category.id]));

  if (definitions.length > 0) {
    await tx.product.createMany({
      data: definitions.map((definition) => {
        const categoryId = categoryIdByCode.get(definition.categoryCode);
        if (!categoryId) throw new Error(`找不到商品分類 ${definition.categoryCode}`);
        return {
          tenantId: input.tenantId,
          sku: definition.sku,
          barcode: definition.barcode,
          name: definition.name,
          categoryId,
          unitId: unit.id,
          costPrice: definition.cost,
          salePrice: definition.price,
          safetyStock: definition.safetyStock,
          taxRateId: tax?.id,
          imageUrl: definition.imageUrl,
          remark: "系統基礎資料，可自行修改或刪除",
        };
      }),
      skipDuplicates: true,
    });
  }

  const products = await tx.product.findMany({
    where: {
      tenantId: input.tenantId,
      sku: { in: definitions.map((definition) => definition.sku) },
    },
    select: { id: true, sku: true, costPrice: true, salePrice: true },
  });
  const productBySku = new Map<string, any>(products.map((product: any) => [product.sku, product]));

  const existingStocks = products.length > 0
    ? await tx.inventoryStock.findMany({
        where: {
          warehouseId: input.mainWarehouseId,
          productId: { in: products.map((product: any) => product.id) },
        },
        select: { productId: true },
      })
    : [];
  const stockedProductIds = new Set<string>(existingStocks.map((stock: any) => stock.productId));
  const missingStocks = definitions
    .map((definition) => ({ definition, product: productBySku.get(definition.sku) }))
    .filter((item) => item.product && !stockedProductIds.has(item.product.id));

  if (missingStocks.length > 0) {
    await tx.inventoryStock.createMany({
      data: missingStocks.map(({ definition, product }) => ({
        tenantId: input.tenantId,
        productId: product.id,
        warehouseId: input.mainWarehouseId,
        quantity: definition.quantity,
      })),
      skipDuplicates: true,
    });
    await tx.inventoryTransaction.createMany({
      data: missingStocks.map(({ definition, product }) => ({
        tenantId: input.tenantId,
        productId: product.id,
        warehouseId: input.mainWarehouseId,
        type: "MANUAL",
        quantity: definition.quantity,
        unitCost: definition.cost,
        refType: "BASELINE",
        refId: product.id,
        remark: "系統建立期初範例庫存",
      })),
    });
  }

  const primary = definitions[0] ? productBySku.get(definitions[0].sku) : undefined;
  if (primary) {
    const purchaseNumber = "DEMO-PO-001";
    const purchase = await tx.purchaseOrder.findUnique({
      where: { tenantId_number: { tenantId: input.tenantId, number: purchaseNumber } },
      select: { id: true },
    });
    if (!purchase) {
      const subtotal = Number(primary.costPrice) * 10;
      const taxAmount = Math.round(subtotal * 0.05 * 100) / 100;
      await tx.purchaseOrder.create({
        data: {
          tenantId: input.tenantId,
          number: purchaseNumber,
          supplierId: supplier.id,
          warehouseId: input.mainWarehouseId,
          status: "DRAFT",
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
          remark: "範例採購單，可開啟後接續送審／進貨",
          items: { create: [{ productId: primary.id, quantity: 10, unitPrice: primary.costPrice, taxRate: 0.05, subtotal }] },
        },
      });
    }

    const salesNumber = "DEMO-SO-001";
    const sale = await tx.salesOrder.findUnique({
      where: { tenantId_number: { tenantId: input.tenantId, number: salesNumber } },
      select: { id: true },
    });
    if (!sale) {
      const subtotal = Number(primary.salePrice) * 2;
      const taxAmount = Math.round(subtotal * 0.05 * 100) / 100;
      await tx.salesOrder.create({
        data: {
          tenantId: input.tenantId,
          number: salesNumber,
          customerId: customer.id,
          warehouseId: input.mainWarehouseId,
          status: "DRAFT",
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
          remark: "範例銷售單，可開啟後接續送審／出貨",
          items: { create: [{ productId: primary.id, quantity: 2, unitPrice: primary.salePrice, taxRate: 0.05, subtotal }] },
        },
      });
    }
  }

  if (includeRetail || includeRestaurant || includeCommerce) {
    await tx.posPromotion.upsert({
      where: { tenantId_code: { tenantId: input.tenantId, code: "WELCOME10" } },
      update: { isActive: true },
      create: { tenantId: input.tenantId, code: "WELCOME10", name: "滿千 9 折", kind: "PERCENT", value: 10, minSpend: 1_000, priority: 10 },
    });
    await tx.posCoupon.upsert({
      where: { tenantId_code: { tenantId: input.tenantId, code: "DEMO100" } },
      update: { isActive: true },
      create: { tenantId: input.tenantId, code: "DEMO100", name: "新客折 100", kind: "AMOUNT", value: 100, minSpend: 500, maxUses: 100, perCustomerLimit: 1 },
    });
  }

  if (includeRestaurant) {
    const patio = await tx.restaurantArea.upsert({
      where: { tenantId_code: { tenantId: input.tenantId, code: "PATIO" } },
      update: { isActive: true },
      create: { tenantId: input.tenantId, code: "PATIO", name: "窗邊區", sortOrder: 2 },
    });
    await tx.restaurantTable.createMany({
      data: Array.from({ length: 4 }, (_, offset) => {
        const index = offset + 9;
        return {
          tenantId: input.tenantId,
          areaId: patio.id,
          code: `T${String(index).padStart(2, "0")}`,
          name: `${index} 號桌`,
          seats: 4,
          sortOrder: index,
        };
      }),
      skipDuplicates: true,
    });
  }

  await tx.companySetting.updateMany({
    where: { tenantId: input.tenantId, name: "我的公司" },
    data: { name: input.tenantName },
  });
}
