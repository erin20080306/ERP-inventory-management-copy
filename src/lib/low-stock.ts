import { prisma } from "./prisma";

// 低庫存偵測：跨倉加總每個商品的即時庫存，與安全庫存（safetyStock）比較。
// 只納入「有追蹤庫存、上架中、未封存、且有設定安全庫存(>0)」的商品。

export type LowStockItem = {
  productId: string;
  sku: string;
  name: string;
  onHand: number;
  safetyStock: number;
  shortage: number; // 低於安全庫存的差額
};

export type TenantLowStock = {
  tenantId: string;
  tenantName: string;
  companyEmail: string | null;
  items: LowStockItem[];
};

/**
 * 掃描所有租戶的低庫存商品。回傳僅包含「有低庫存項目」的租戶。
 */
export async function scanLowStock(): Promise<TenantLowStock[]> {
  // 一次撈出所有需監控的商品（含安全庫存與所屬租戶）
  const products = await prisma.product.findMany({
    where: {
      trackInventory: true,
      isActive: true,
      isArchived: false,
      safetyStock: { gt: 0 },
    },
    select: {
      id: true,
      sku: true,
      name: true,
      safetyStock: true,
      tenantId: true,
    },
  });

  if (products.length === 0) return [];

  const productIds = products.map((p) => p.id);

  // 跨倉加總每個商品的現有庫存
  const stockRows = await prisma.inventoryStock.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _sum: { quantity: true },
  });

  const onHandByProduct = new Map<string, number>();
  for (const row of stockRows) {
    onHandByProduct.set(row.productId, Number(row._sum.quantity ?? 0));
  }

  // 收集會受影響的租戶名稱與通知信箱
  const tenantIds = Array.from(new Set(products.map((p) => p.tenantId)));
  const companies = await prisma.companySetting.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { tenantId: true, name: true, email: true },
  });
  const companyByTenant = new Map(companies.map((c) => [c.tenantId, c]));

  const byTenant = new Map<string, TenantLowStock>();

  for (const product of products) {
    const onHand = onHandByProduct.get(product.id) ?? 0;
    const safety = Number(product.safetyStock);
    if (onHand >= safety) continue;

    let bucket = byTenant.get(product.tenantId);
    if (!bucket) {
      const company = companyByTenant.get(product.tenantId);
      bucket = {
        tenantId: product.tenantId,
        tenantName: company?.name ?? "未命名公司",
        companyEmail: company?.email ?? null,
        items: [],
      };
      byTenant.set(product.tenantId, bucket);
    }

    bucket.items.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      onHand,
      safetyStock: safety,
      shortage: safety - onHand,
    });
  }

  // 每個租戶內依缺額由大到小排序，方便通知信一眼看到最急迫的品項
  for (const bucket of byTenant.values()) {
    bucket.items.sort((a, b) => b.shortage - a.shortage);
  }

  return Array.from(byTenant.values());
}
