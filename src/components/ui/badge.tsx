import * as React from "react";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  warning: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  danger: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  info: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  outline: "border border-border text-muted-foreground",
};

const dotColors: Record<string, string> = {
  default: "bg-slate-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  outline: "bg-slate-400",
};

export function Badge({
  className,
  variant = "default",
  children,
}: {
  className?: string;
  variant?: keyof typeof styles;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", styles[variant], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant])} />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: keyof typeof styles }> = {
    // 統一單據狀態流程
    DRAFT: { label: "草稿", variant: "outline" },
    SUBMITTED: { label: "已送審", variant: "info" },
    APPROVED: { label: "已審核", variant: "success" },
    PARTIALLY_RECEIVED: { label: "部分進貨", variant: "warning" },
    PARTIALLY_SHIPPED: { label: "部分出貨", variant: "warning" },
    POSTED: { label: "已過帳", variant: "success" },
    VOIDED: { label: "已作廢", variant: "danger" },
    REJECTED: { label: "已駁回", variant: "danger" },
  };
  const info = map[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}
