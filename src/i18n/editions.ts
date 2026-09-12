import type { BusinessMode } from "@/lib/product-editions";

/**
 * 營運版別名稱的翻譯鍵。
 *
 * PRODUCT_EDITIONS 內的中文字串保留不動（它同時描述資料結構與預設值），
 * 顯示時改查 editions.<MODE>.*，讓版別名稱跟著介面語言走。
 */
export function editionLabelKey(mode: BusinessMode, field: "label" | "shortLabel" | "description") {
  return `${mode}.${field}` as const;
}
