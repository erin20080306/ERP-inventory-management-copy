"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { createFormatters, type LocaleFormatters } from "./format";

/**
 * Client Component 取得語言感知的格式化工具。
 * 幣別請由呼叫端傳入租戶設定值；未傳入時沿用 TWD，行為與改版前相同。
 */
export function useFormatters(defaultCurrency = "TWD"): LocaleFormatters {
  const locale = useLocale();
  return useMemo(() => createFormatters(locale, defaultCurrency), [locale, defaultCurrency]);
}
