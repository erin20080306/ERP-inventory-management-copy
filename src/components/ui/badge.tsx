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
    DRAFT: { label: "草稿", variant: "outline" },
    SUBMITTED: { label: "已送出", variant: "info" },
    APPROVED: { label: "已核准", variant: "success" },
    RECEIVED: { label: "已進貨", variant: "success" },
    CANCELLED: { label: "已取消", variant: "danger" },
    CONFIRMED: { label: "已確認", variant: "info" },
    SHIPPED: { label: "已出貨", variant: "success" },
    INVOICED: { label: "已開立發票", variant: "success" },
    PAID: { label: "已收款", variant: "success" },
    ACCEPTED: { label: "已接受", variant: "success" },
    REJECTED: { label: "已拒絕", variant: "danger" },
    EXPIRED: { label: "已過期", variant: "warning" },
    POSTED: { label: "已過帳", variant: "success" },
    VOID: { label: "作廢", variant: "danger" },
    OPEN: { label: "未結", variant: "info" },
    PARTIAL: { label: "部分沖銷", variant: "warning" },
    OVERDUE: { label: "逾期", variant: "danger" },
    ISSUED: { label: "已開立", variant: "success" },
  };
  const info = map[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}
