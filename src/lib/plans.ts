export type PlanCode = "TEAM_2" | "TEAM_3" | "TEAM_5" | "SMALL_8";
export type BillingCycle = "MONTHLY" | "ANNUAL" | "ONCE";

export type ErpPlan = {
  code: PlanCode;
  name: string;
  shortName: string;
  seats: number;
  monthlyPrice: number;
  annualPrice: number;
  lifetimePrice: number;
  maintenancePrice: number;
  description: string;
};

export const PLAN_CATALOG: readonly ErpPlan[] = [
  {
    code: "TEAM_2",
    name: "1 對 2 台方案",
    shortName: "2 台",
    seats: 2,
    monthlyPrice: 699,
    annualPrice: 6_990,
    lifetimePrice: 20_000,
    maintenancePrice: 2_000,
    description: "適合個人工作室或兩人協作",
  },
  {
    code: "TEAM_3",
    name: "1 對 3 台方案",
    shortName: "3 台",
    seats: 3,
    monthlyPrice: 999,
    annualPrice: 9_990,
    lifetimePrice: 35_000,
    maintenancePrice: 2_000,
    description: "適合小型門市與進銷存分工",
  },
  {
    code: "TEAM_5",
    name: "1 對 5 台方案",
    shortName: "5 台",
    seats: 5,
    monthlyPrice: 1_299,
    annualPrice: 12_990,
    lifetimePrice: 45_000,
    maintenancePrice: 2_000,
    description: "適合多部門或多工作站協作",
  },
  {
    code: "SMALL_8",
    name: "小企業專案",
    shortName: "8 台內",
    seats: 8,
    monthlyPrice: 1_599,
    annualPrice: 15_990,
    lifetimePrice: 55_000,
    maintenancePrice: 2_000,
    description: "適合 8 台以內的小企業部署",
  },
] as const;

export const ECOMMERCE_PRICING = {
  monthlyByPlan: {
    TEAM_2: 2_999,
    TEAM_3: 3_999,
    TEAM_5: 4_999,
    SMALL_8: 6_999,
  } satisfies Record<PlanCode, number>,
  annualByPlan: {
    TEAM_2: 29_990,
    TEAM_3: 39_990,
    TEAM_5: 49_990,
    SMALL_8: 69_990,
  } satisfies Record<PlanCode, number>,
  lifetimeByPlan: {
    TEAM_2: 35_000,
    TEAM_3: 44_999,
    TEAM_5: 54_999,
    SMALL_8: 68_999,
  } satisfies Record<PlanCode, number>,
  websiteDesignFee: {
    MONTHLY: 20_000,
    ANNUAL: 15_000,
    ONCE: 0,
  } satisfies Record<BillingCycle, number>,
} as const;

export function isEcommerceMode(value: string | null | undefined) {
  return value === "ECOMMERCE";
}

export const BILLING_LABELS: Record<BillingCycle, string> = {
  MONTHLY: "月租",
  ANNUAL: "年租（送 2 個月）",
  ONCE: "一次買斷",
};

export function getPlan(code: string | null | undefined) {
  return PLAN_CATALOG.find((plan) => plan.code === code) ?? null;
}

export function getPlanPrice(plan: ErpPlan, cycle: BillingCycle, businessMode?: string | null) {
  if (isEcommerceMode(businessMode)) {
    if (cycle === "MONTHLY") return ECOMMERCE_PRICING.monthlyByPlan[plan.code];
    if (cycle === "ANNUAL") return ECOMMERCE_PRICING.annualByPlan[plan.code];
    return ECOMMERCE_PRICING.lifetimeByPlan[plan.code];
  }
  if (cycle === "MONTHLY") return plan.monthlyPrice;
  if (cycle === "ANNUAL") return plan.annualPrice;
  return plan.lifetimePrice;
}

export function getWebsiteDesignFee(cycle: BillingCycle, businessMode?: string | null) {
  return isEcommerceMode(businessMode) ? ECOMMERCE_PRICING.websiteDesignFee[cycle] : 0;
}

export function formatTwd(amount: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
