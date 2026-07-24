import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: any, currency = "NT$") {
  const v = Number(n ?? 0);
  return `${currency} ${Math.round(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * TWD 單據金額以元為單位；只有商品單價保留小數，讓數量乘算後再四捨五入到元。
 */
export function formatUnitPrice(n: any, currency = "NT$") {
  const v = Number(n ?? 0);
  return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}`;
}

export function roundTwd(n: any) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? Math.round(v) : 0;
}

export function isWholeTwdAmount(n: any) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) && Number.isInteger(v);
}

export function formatNumber(n: any, fractionDigits = 0) {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("zh-TW", { hour12: false });
}
