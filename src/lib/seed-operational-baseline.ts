type BusinessMode = "ERP" | "POS_RETAIL" | "POS_RESTAURANT";

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

const RESTAURANT_PRODUCTS: BaselineProduct[] = [
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F001", name: "經典牛肉漢堡", cost: 80, price: 220, quantity: 60, safetyStock: 10, imageUrl: "/demo-products/burger.svg" },
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F002", name: "香蒜奶油義大利麵", cost: 65, price: 190, quantity: 60, safetyStock: 10, imageUrl: "/demo-products/pasta.svg" },
  { categoryCode: "MEAL", categoryName: "主餐", sku: "F003", name: "松露脆薯", cost: 35, price: 120, quantity: 80, safetyStock: 15, imageUrl: "/demo-products/fries.svg" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D001", name: "拿鐵咖啡", cost: 30, price: 110, quantity: 80, safetyStock: 15, imageUrl: "/demo-products/latte.svg" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D002", name: "季節水果茶", cost: 28, price: 100, quantity: 80, safetyStock: 15, imageUrl: "/demo-products/tea.svg" },
  { categoryCode: "DRINK", categoryName: "飲品甜點", sku: "D003", name: "焦糖乳酪蛋糕", cost: 45, price: 130, quantity: 40, safetyStock: 8, imageUrl: "/demo-products/cake.svg" },
];

function normalizedMode(value: string | null | undefined): BusinessMode {
  if (value === "POS_RESTAURANT") return "POS_RESTAURANT";
  if (value === "POS_RETAIL" || value === "POS") return "POS_RETAIL";
  return "ERP";
}

/**
 * 建立能直接操作的基礎資料，不覆寫使用者已修改的庫存與交易。
 * 所有代碼固定且使用 upsert／存在檢查，因此可在註冊、管理者登入與補資料腳本重複執行。
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

  const tax = await tx.taxRate.findUnique({
    where: { tenantId_code: { tenantId: input.tenantId, code: "VAT5" } },
    select: { id: true },
  });
  const unit = await tx.productUnit.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "PCS" } },
    update: {},
    create: { tenantId: input.tenantId, code: "PCS", name: includeRestaurant && !includeErp && !includeRetail ? "份" : "個" },
  });

  await tx.warehouse.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "WH02" } },
    update: {},
    create: { tenantId: input.tenantId, code: "WH02", name: includeRetail || includeRestaurant ? "門市備用倉" : "備用倉庫" },
  });
  const customer = await tx.customer.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: "C001" } },
    update: {},
    create: {
      tenantId: input.tenantId,
      code: "C001",
      companyName: includeRetail || includeRestaurant ? "示範會員－王小姐" : "範例客戶有限公司",
      contactName: "王小姐",
      phone: "0912-345-678",
      email: "demo-customer@example.com",
      paymentTerms: "月結 30 天",
      loyaltyPoints: includeRetail || includeRestaurant ? 120 : 0,
      loyaltyTier: includeRetail || includeRestaurant ? "GOLD" : "STANDARD",
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
  ];
  const products: any[] = [];
  for (const definition of definitions) {
    const category = await tx.productCategory.upsert({
      where: { tenantId_code: { tenantId: input.tenantId, code: definition.categoryCode } },
      update: {},
      create: { tenantId: input.tenantId, code: definition.categoryCode, name: definition.categoryName },
    });
    const product = await tx.product.upsert({
      where: { tenantId_sku: { tenantId: input.tenantId, sku: definition.sku } },
      update: {
        barcode: definition.barcode,
        name: definition.name,
        categoryId: category.id,
        unitId: unit.id,
        costPrice: definition.cost,
        salePrice: definition.price,
        safetyStock: definition.safetyStock,
        taxRateId: tax?.id,
        imageUrl: definition.imageUrl,
        isActive: true,
      },
      create: {
        tenantId: input.tenantId,
        sku: definition.sku,
        barcode: definition.barcode,
        name: definition.name,
        categoryId: category.id,
        unitId: unit.id,
        costPrice: definition.cost,
        salePrice: definition.price,
        safetyStock: definition.safetyStock,
        taxRateId: tax?.id,
        imageUrl: definition.imageUrl,
        remark: "系統基礎資料，可自行修改或刪除",
      },
    });
    products.push(product);
    const stock = await tx.inventoryStock.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: input.mainWarehouseId } },
      select: { id: true },
    });
    if (!stock) {
      await tx.inventoryStock.create({
        data: { tenantId: input.tenantId, productId: product.id, warehouseId: input.mainWarehouseId, quantity: definition.quantity },
      });
      await tx.inventoryTransaction.create({
        data: {
          tenantId: input.tenantId,
          productId: product.id,
          warehouseId: input.mainWarehouseId,
          type: "MANUAL",
          quantity: definition.quantity,
          unitCost: definition.cost,
          refType: "BASELINE",
          refId: product.id,
          remark: "系統建立期初範例庫存",
        },
      });
    }
  }

  const primary = products[0];
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

  if (includeRetail || includeRestaurant) {
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
    for (let index = 9; index <= 12; index += 1) {
      const code = `T${String(index).padStart(2, "0")}`;
      await tx.restaurantTable.upsert({
        where: { tenantId_code: { tenantId: input.tenantId, code } },
        update: { areaId: patio.id, isActive: true },
        create: { tenantId: input.tenantId, areaId: patio.id, code, name: `${index} 號桌`, seats: 4, sortOrder: index },
      });
    }
  }

  await tx.companySetting.updateMany({
    where: { tenantId: input.tenantId, name: "我的公司" },
    data: { name: input.tenantName },
  });
}
