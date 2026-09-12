import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PageShell({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

// 預設標題需要翻譯，因此實作放在 client 檔；這裡 re-export 維持既有 import 路徑不變。
export { EmptyState } from "./empty-state";

export async function ForbiddenPage() {
  const t = await getTranslations("table");
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="text-4xl font-bold text-muted-foreground">403</div>
        <div className="mt-2 text-lg font-medium">{t("forbidden")}</div>
        <div className="text-sm text-muted-foreground mt-1">{t("forbiddenBody")}</div>
      </div>
    </div>
  );
}
