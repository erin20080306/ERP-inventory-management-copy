export type DepreciableAsset = {
  acquireCost: number | string;
  residualValue: number | string;
  usefulLifeMonths: number;
  method: "STRAIGHT_LINE" | "DOUBLE_DECLINING" | "SUM_OF_YEARS" | "NONE";
  accumulatedDepreciation: number | string;
  bookValue: number | string;
  accountCode?: string | null;
  category?: string | null;
};

export function roundDepreciationMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function depreciationPeriod(date: Date) {
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${taipei.getUTCFullYear()}-${String(taipei.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parseDepreciationDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("折舊日期必須為 YYYY-MM-DD");
  const [year, month, day] = text.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) {
    throw new Error("折舊日期不是有效的日曆日期");
  }
  const date = new Date(`${text}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("折舊日期格式不正確");
  return date;
}

export function computeSuggestedDepreciation(asset: DepreciableAsset, confirmedPeriods: number) {
  const cost = Number(asset.acquireCost);
  const residual = Number(asset.residualValue);
  const life = Math.max(1, Number(asset.usefulLifeMonths));
  const bookValue = Number(asset.bookValue);
  const depreciableBase = Math.max(0, cost - residual);
  const remaining = roundDepreciationMoney(Math.max(0, bookValue - residual));
  if (asset.method === "NONE" || remaining <= 0 || confirmedPeriods >= life) {
    return { amount: 0, remaining, openingBookValue: bookValue, closingBookValue: bookValue };
  }

  let suggested = 0;
  if (asset.method === "DOUBLE_DECLINING") {
    suggested = bookValue * (2 / life);
  } else if (asset.method === "SUM_OF_YEARS") {
    const remainingPeriods = Math.max(1, life - confirmedPeriods);
    suggested = depreciableBase * remainingPeriods / ((life * (life + 1)) / 2);
  } else {
    suggested = depreciableBase / life;
  }

  const amount = roundDepreciationMoney(Math.min(remaining, Math.max(0, suggested)));
  return {
    amount,
    remaining,
    openingBookValue: roundDepreciationMoney(bookValue),
    closingBookValue: roundDepreciationMoney(Math.max(residual, bookValue - amount)),
  };
}

const ACCUMULATED_ACCOUNT_BY_ASSET: Record<string, string> = {
  "1411": "1451",
  "1421": "1452",
  "1431": "1453",
  "1441": "1454",
  "1442": "1455",
  "1602": "1603",
  "1610": "1611",
  "1620": "1621",
  "1630": "1631",
};

export function preferredAccumulatedAccountCode(asset: Pick<DepreciableAsset, "accountCode" | "category">) {
  const direct = asset.accountCode ? ACCUMULATED_ACCOUNT_BY_ASSET[asset.accountCode] : undefined;
  if (direct) return direct;
  const category = String(asset.category ?? "");
  if (category.includes("房屋") || category.includes("建築")) return "1451";
  if (category.includes("機器")) return "1452";
  if (category.includes("運輸") || category.includes("車")) return "1453";
  if (category.includes("電腦")) return "1455";
  return "1454";
}
