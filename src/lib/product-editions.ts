export const BUSINESS_MODES = ["ERP", "POS_RETAIL", "POS_RESTAURANT"] as const;

export type BusinessMode = (typeof BUSINESS_MODES)[number];
export type StoredBusinessMode = BusinessMode | "POS";

export type ProductEdition = {
  mode: BusinessMode;
  group: "ERP" | "POS";
  label: string;
  shortLabel: string;
  description: string;
  homePath: string;
};

export const PRODUCT_EDITIONS: Record<BusinessMode, ProductEdition> = {
  ERP: {
    mode: "ERP",
    group: "ERP",
    label: "一般企業進銷存會計",
    shortLabel: "企業 ERP",
    description: "採購、銷售、庫存、應收應付、發票與會計傳票",
    homePath: "/workspace",
  },
  POS_RETAIL: {
    mode: "POS_RETAIL",
    group: "POS",
    label: "門市零售版・POS＋進銷存＋會計",
    shortLabel: "零售 POS",
    description: "條碼掃碼、會員促銷、退換貨、日結、庫存與會計",
    homePath: "/workspace",
  },
  POS_RESTAURANT: {
    mode: "POS_RESTAURANT",
    group: "POS",
    label: "餐飲版・桌位點餐＋廚房＋進銷存＋會計",
    shortLabel: "餐飲 POS",
    description: "圖片點餐、桌位、送廚、出餐、結帳、庫存與會計",
    homePath: "/workspace",
  },
};

/** 舊資料庫的 POS 一律安全視為零售業，避免既有客戶登入失效。 */
export function normalizeBusinessMode(value: string | null | undefined): BusinessMode {
  if (value === "POS_RESTAURANT") return "POS_RESTAURANT";
  if (value === "POS_RETAIL" || value === "POS") return "POS_RETAIL";
  return "ERP";
}

export function isPosMode(value: string | null | undefined) {
  return normalizeBusinessMode(value) !== "ERP";
}

export function isRestaurantMode(value: string | null | undefined) {
  return normalizeBusinessMode(value) === "POS_RESTAURANT";
}

export function getProductEdition(value: string | null | undefined) {
  return PRODUCT_EDITIONS[normalizeBusinessMode(value)];
}

export function businessModeDbValues(mode: "ERP" | "POS") {
  return mode === "ERP" ? ["ERP"] : ["POS", "POS_RETAIL", "POS_RESTAURANT"];
}
