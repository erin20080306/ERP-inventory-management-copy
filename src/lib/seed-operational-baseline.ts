import { legacyDemoProductImages, resolveDemoProductImage } from "./demo-product-media";

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

type CatalogProduct = BaselineProduct & {
  catalogMode: BusinessMode;
};

const ERP_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "ERP-DEMO", categoryName: "進銷存範例商品", sku: "ERP-P001", barcode: "4711000000015", name: "A4 影印紙（箱）", cost: 820, price: 1_050, quantity: 24, safetyStock: 5, imageUrl: "/demo-products/a4-copy-paper-carton.webp" },
  { categoryCode: "ERP-DEMO", categoryName: "進銷存範例商品", sku: "ERP-P002", barcode: "4711000000022", name: "人體工學辦公椅", cost: 2_800, price: 4_200, quantity: 12, safetyStock: 3, imageUrl: "/demo-products/ergonomic-office-chair.webp" },
  { categoryCode: "ERP-DEMO", categoryName: "進銷存範例商品", sku: "ERP-P003", barcode: "4711000000039", name: "商用 24 吋螢幕", cost: 3_200, price: 4_680, quantity: 18, safetyStock: 4, imageUrl: "/demo-products/commercial-24-inch-monitor.webp" },
];

export const RETAIL_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "RETAIL-HOT", categoryName: "熱銷推薦", sku: "RTL-P001", barcode: "4712000000014", name: "純棉購物袋", cost: 80, price: 180, quantity: 50, safetyStock: 10, imageUrl: "/demo-products/cotton-tote.webp" },
  { categoryCode: "RETAIL-HOT", categoryName: "熱銷推薦", sku: "RTL-P002", barcode: "4712000000021", name: "不鏽鋼保溫杯", cost: 220, price: 490, quantity: 36, safetyStock: 8, imageUrl: "/demo-products/vacuum-bottle.webp" },
  { categoryCode: "RETAIL-AROMA", categoryName: "香氛保養", sku: "RTL-P003", barcode: "4712000000038", name: "木質調香氛蠟燭", cost: 160, price: 360, quantity: 28, safetyStock: 6, imageUrl: "/demo-products/scented-candle.webp" },
  { categoryCode: "RETAIL-ACC", categoryName: "服飾配件", sku: "RTL-P004", barcode: "4712000000045", name: "極簡皮革卡夾", cost: 320, price: 680, quantity: 17, safetyStock: 5, imageUrl: "/demo-products/leather-card-holder.webp" },
  { categoryCode: "RETAIL-AROMA", categoryName: "香氛保養", sku: "RTL-P005", barcode: "4712000000052", name: "植萃護手霜", cost: 140, price: 320, quantity: 41, safetyStock: 8, imageUrl: "/demo-products/hand-cream.webp" },
  { categoryCode: "RETAIL-LIFE", categoryName: "生活選物", sku: "RTL-P006", barcode: "4712000000069", name: "亞麻室內拖鞋", cost: 260, price: 560, quantity: 22, safetyStock: 5, imageUrl: "/demo-products/linen-slippers.webp" },
  { categoryCode: "RETAIL-LIFE", categoryName: "生活選物", sku: "RTL-P007", barcode: "4712000000076", name: "霧面陶瓷馬克杯", cost: 190, price: 420, quantity: 34, safetyStock: 7, imageUrl: "/demo-products/ceramic-mug.webp" },
  { categoryCode: "RETAIL-ACC", categoryName: "服飾配件", sku: "RTL-P008", barcode: "4712000000083", name: "棉麻日常圍裙", cost: 360, price: 780, quantity: 19, safetyStock: 5, imageUrl: "/demo-products/linen-apron.webp" },
  { categoryCode: "RETAIL-LIFE", categoryName: "生活選物", sku: "RTL-P009", barcode: "4712000000090", name: "旅行收納袋組", cost: 260, price: 590, quantity: 26, safetyStock: 6, imageUrl: "/demo-products/travel-organizer.webp" },
  { categoryCode: "RETAIL-LIFE", categoryName: "生活選物", sku: "RTL-P010", barcode: "4712000000106", name: "北歐針織抱枕", cost: 390, price: 890, quantity: 15, safetyStock: 4, imageUrl: "/demo-products/knit-cushion.webp" },
  { categoryCode: "RETAIL-AROMA", categoryName: "香氛保養", sku: "RTL-P011", barcode: "4712000000113", name: "天然精油滾珠瓶", cost: 210, price: 460, quantity: 31, safetyStock: 6, imageUrl: "/demo-products/essential-oil.webp" },
  { categoryCode: "RETAIL-HOT", categoryName: "熱銷推薦", sku: "RTL-P012", barcode: "4712000000120", name: "不鏽鋼餐具組", cost: 240, price: 520, quantity: 29, safetyStock: 6, imageUrl: "/demo-products/cutlery-set.webp" },
];
const COMMERCE_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "EC-TOP", categoryName: "上身", sku: "EC-P001", barcode: "4713000000013", name: "雲感落肩襯衫", cost: 720, price: 1_680, quantity: 18, safetyStock: 5, imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-BOTTOM", categoryName: "下身", sku: "EC-P002", barcode: "4713000000020", name: "輪廓打褶寬褲", cost: 980, price: 2_280, quantity: 12, safetyStock: 4, imageUrl: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-KNIT", categoryName: "針織", sku: "EC-P003", barcode: "4713000000037", name: "日常織紋針織衫", cost: 760, price: 1_880, quantity: 24, safetyStock: 6, imageUrl: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-ACC", categoryName: "配件", sku: "EC-P004", barcode: "4713000000044", name: "方形皮革肩背包", cost: 1_120, price: 2_680, quantity: 12, safetyStock: 4, imageUrl: "https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-DRESS", categoryName: "套裝", sku: "EC-P005", barcode: "4713000000051", name: "亮黃連帽休閒套裝", cost: 1_280, price: 2_980, quantity: 9, safetyStock: 3, imageUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=82" },
  { categoryCode: "EC-SHOES", categoryName: "鞋履", sku: "EC-P006", barcode: "4713000000068", name: "極簡皮革休閒鞋", cost: 1_450, price: 3_280, quantity: 15, safetyStock: 4, imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=82" },
];
export const RESTAURANT_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F001", name: "經典牛肉漢堡", cost: 80, price: 220, quantity: 60, safetyStock: 10, imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F002", name: "香蒜奶油義大利麵", cost: 65, price: 190, quantity: 60, safetyStock: 10, imageUrl: "https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "SNACK", categoryName: "小點", sku: "F003", name: "松露脆薯", cost: 35, price: 120, quantity: 80, safetyStock: 15, imageUrl: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F004", name: "香煎雞腿排", cost: 105, price: 260, quantity: 48, safetyStock: 10, imageUrl: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F005", name: "奶油鮭魚燉飯", cost: 120, price: 280, quantity: 42, safetyStock: 8, imageUrl: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "SNACK", categoryName: "小點", sku: "F006", name: "和風鮮蔬沙拉", cost: 55, price: 150, quantity: 54, safetyStock: 10, imageUrl: "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "SNACK", categoryName: "小點", sku: "F007", name: "主廚玉米濃湯", cost: 30, price: 90, quantity: 70, safetyStock: 12, imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D001", name: "拿鐵咖啡", cost: 30, price: 110, quantity: 80, safetyStock: 15, imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D002", name: "季節水果茶", cost: 28, price: 100, quantity: 80, safetyStock: 15, imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D003", name: "焦糖乳酪蛋糕", cost: 45, price: 130, quantity: 40, safetyStock: 8, imageUrl: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D004", name: "經典提拉米蘇", cost: 60, price: 160, quantity: 36, safetyStock: 8, imageUrl: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=500&q=80" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D005", name: "柚香氣泡飲", cost: 35, price: 120, quantity: 64, safetyStock: 12, imageUrl: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=500&q=80" },
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

  const definitions: CatalogProduct[] = [
    ...(includeErp ? ERP_PRODUCTS.map((product) => ({ ...product, catalogMode: "ERP" as const })) : []),
    ...(includeRetail ? RETAIL_PRODUCTS.map((product) => ({ ...product, catalogMode: "POS_RETAIL" as const })) : []),
    ...(includeRestaurant ? RESTAURANT_PRODUCTS.map((product) => ({ ...product, catalogMode: "POS_RESTAURANT" as const })) : []),
    ...(includeCommerce ? COMMERCE_PRODUCTS.map((product) => ({ ...product, catalogMode: "ECOMMERCE" as const })) : []),
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
          catalogMode: definition.catalogMode,
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

  if (definitions.length > 0) {
    await Promise.all(definitions.map((definition) => tx.product.updateMany({
      where: { tenantId: input.tenantId, sku: definition.sku },
      data: { catalogMode: definition.catalogMode },
    })));
  }

  const productsWithDefaultImages = definitions.filter((definition) => definition.imageUrl);
  if (productsWithDefaultImages.length > 0) {
    await Promise.all(productsWithDefaultImages.map((definition) => tx.product.updateMany({
      where: {
        tenantId: input.tenantId,
        sku: definition.sku,
        OR: [
          { imageUrl: null },
          ...legacyDemoProductImages(definition.sku).map((imageUrl) => ({ imageUrl })),
        ],
      },
      data: { imageUrl: definition.imageUrl },
    })));
  }
  if (includeRetail) {
    const retailImageCandidates = await tx.product.findMany({
      where: { tenantId: input.tenantId },
      select: {
        id: true,
        sku: true,
        name: true,
        imageUrl: true,
        category: { select: { name: true } },
      },
    });
    const retailImageUpdates = retailImageCandidates.flatMap((product: any) => {
      const imageUrl = resolveDemoProductImage(
        product.sku,
        product.imageUrl,
        product.name,
        product.category?.name,
        true,
      );
      return imageUrl && imageUrl !== product.imageUrl
        ? [{ id: product.id, imageUrl }]
        : [];
    });
    if (retailImageUpdates.length > 0) {
      await Promise.all(retailImageUpdates.map((product: any) => tx.product.update({
        where: { id: product.id },
        data: { imageUrl: product.imageUrl },
      })));
    }
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
