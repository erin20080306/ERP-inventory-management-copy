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

export function EmptyState({ title = "目前沒有資料", description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="border border-dashed rounded-xl p-12 text-center">
      <div className="text-lg font-medium">{title}</div>
      {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="text-4xl font-bold text-muted-foreground">403</div>
        <div className="mt-2 text-lg font-medium">權限不足</div>
        <div className="text-sm text-muted-foreground mt-1">您沒有瀏覽此頁面的權限，請聯絡管理員。</div>
      </div>
    </div>
  );
}
