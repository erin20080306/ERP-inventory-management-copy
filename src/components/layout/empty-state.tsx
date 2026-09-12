"use client";

import { useTranslations } from "next-intl";

/**
 * 空資料提示。
 *
 * 獨立成 client 檔，是為了讓預設標題能跟著介面語言走，
 * 同時讓 page-shell.tsx 的 PageShell 維持 Server Component（它本身沒有任何待翻字串）。
 * page-shell.tsx 會再把這個元件 re-export，因此既有的 import 路徑完全不用改。
 */
export function EmptyState({ title, description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  const t = useTranslations("table");
  return (
    <div className="border border-dashed rounded-xl p-12 text-center">
      <div className="text-lg font-medium">{title ?? t("noData")}</div>
      {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
