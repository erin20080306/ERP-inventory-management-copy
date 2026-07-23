const RESTAURANT_DEMO_IMAGE_BY_SKU: Record<string, string> = {
  F001: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80",
  F002: "https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=500&q=80",
  F003: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80",
  F004: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=500&q=80",
  F005: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=500&q=80",
  F006: "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=500&q=80",
  F007: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=500&q=80",
  D001: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=500&q=80",
  D002: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=500&q=80",
  D003: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=500&q=80",
  D004: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=500&q=80",
  D005: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=500&q=80",
};

export const RETAIL_DEMO_IMAGE_BY_SKU: Record<string, string> = {
  "RTL-P001": "/demo-products/cotton-tote.webp",
  "RTL-P002": "/demo-products/vacuum-bottle.webp",
  "RTL-P003": "/demo-products/scented-candle.webp",
  "RTL-P004": "/demo-products/leather-card-holder.webp",
  "RTL-P005": "/demo-products/hand-cream.webp",
  "RTL-P006": "/demo-products/linen-slippers.webp",
  "RTL-P007": "/demo-products/ceramic-mug.webp",
  "RTL-P008": "/demo-products/linen-apron.webp",
  "RTL-P009": "/demo-products/travel-organizer.webp",
  "RTL-P010": "/demo-products/knit-cushion.webp",
  "RTL-P011": "/demo-products/essential-oil.webp",
  "RTL-P012": "/demo-products/cutlery-set.webp",
};

const RETAIL_DEMO_IMAGE_BY_NAME: Record<string, string> = {
  純棉購物袋: "/demo-products/cotton-tote.webp",
  不鏽鋼保溫杯: "/demo-products/vacuum-bottle.webp",
  木質調香氛蠟燭: "/demo-products/scented-candle.webp",
  極簡皮革卡夾: "/demo-products/leather-card-holder.webp",
  植萃護手霜: "/demo-products/hand-cream.webp",
  亞麻室內拖鞋: "/demo-products/linen-slippers.webp",
  霧面陶瓷馬克杯: "/demo-products/ceramic-mug.webp",
  棉麻日常圍裙: "/demo-products/linen-apron.webp",
  旅行收納袋組: "/demo-products/travel-organizer.webp",
  北歐針織抱枕: "/demo-products/knit-cushion.webp",
  天然精油滾珠瓶: "/demo-products/essential-oil.webp",
  不鏽鋼餐具組: "/demo-products/cutlery-set.webp",
};

const RETAIL_CATEGORY_IMAGE_POOL: Record<string, string[]> = {
  熱銷推薦: [
    "/demo-products/cotton-tote.webp",
    "/demo-products/vacuum-bottle.webp",
    "/demo-products/cutlery-set.webp",
  ],
  生活選物: [
    "/demo-products/linen-slippers.webp",
    "/demo-products/ceramic-mug.webp",
    "/demo-products/travel-organizer.webp",
    "/demo-products/knit-cushion.webp",
  ],
  香氛保養: [
    "/demo-products/scented-candle.webp",
    "/demo-products/hand-cream.webp",
    "/demo-products/essential-oil.webp",
  ],
  服飾配件: [
    "/demo-products/leather-card-holder.webp",
    "/demo-products/linen-apron.webp",
  ],
};

const COMMERCE_DEMO_IMAGE_BY_SKU: Record<string, string> = {
  "EC-P001": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=82",
  "EC-P002": "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=82",
  "EC-P003": "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=82",
  "EC-P004": "https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=900&q=82",
  "EC-P005": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=82",
  "EC-P006": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=82",
};

const LEGACY_RESTAURANT_IMAGES: Record<string, string> = {
  F001: "/demo-products/burger.svg",
  F002: "/demo-products/pasta.svg",
  F003: "/demo-products/fries.svg",
  D001: "/demo-products/latte.svg",
  D002: "/demo-products/tea.svg",
  D003: "/demo-products/cake.svg",
};

export const DEMO_PRODUCT_IMAGE_BY_SKU: Record<string, string> = {
  ...RETAIL_DEMO_IMAGE_BY_SKU,
  ...COMMERCE_DEMO_IMAGE_BY_SKU,
  ...RESTAURANT_DEMO_IMAGE_BY_SKU,
};

function missingOrPlaceholderImage(imageUrl?: string | null) {
  const value = imageUrl?.trim();
  return !value
    || value === "null"
    || value === "undefined"
    || /(?:placeholder|no[-_]?image|image[-_]?missing)/i.test(value);
}

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return hash % length;
}

export function resolveDemoProductImage(
  sku: string,
  imageUrl?: string | null,
  name?: string | null,
  categoryName?: string | null,
  useRetailFallback = false,
) {
  const storedImage = imageUrl?.trim() || null;
  if (!missingOrPlaceholderImage(storedImage) && LEGACY_RESTAURANT_IMAGES[sku] !== storedImage) {
    return storedImage;
  }

  const exactDemoImage = DEMO_PRODUCT_IMAGE_BY_SKU[sku]
    || (name ? RETAIL_DEMO_IMAGE_BY_NAME[name.trim()] : undefined);
  if (exactDemoImage) return exactDemoImage;

  const categoryPool = categoryName ? RETAIL_CATEGORY_IMAGE_POOL[categoryName.trim()] : undefined;
  if (categoryPool?.length) {
    return categoryPool[stableIndex(`${sku}:${name || ""}`, categoryPool.length)];
  }
  if (useRetailFallback) {
    const retailImages = Object.values(RETAIL_DEMO_IMAGE_BY_SKU);
    return retailImages[stableIndex(`${sku}:${name || ""}:${categoryName || ""}`, retailImages.length)];
  }
  return null;
}

export function legacyDemoProductImages(sku: string) {
  return LEGACY_RESTAURANT_IMAGES[sku] ? [LEGACY_RESTAURANT_IMAGES[sku]] : [];
}
