import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="relative w-full overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
    <table className={cn("w-full text-sm border-collapse", className)} {...props} />
  </div>
);
export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-800 dark:to-blue-700 text-white sticky top-0 z-10", className)} {...props} />
);
export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("bg-white dark:bg-slate-900 [&_tr:nth-child(even)]:bg-blue-50/60 dark:[&_tr:nth-child(even)]:bg-blue-950/20 [&_tr:last-child]:border-0", className)} {...props} />
);
export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b border-slate-200 dark:border-slate-700 hover:bg-blue-100/60 dark:hover:bg-blue-900/30 transition-colors", className)} {...props} />
);
export const TH = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-9 px-3 text-left font-semibold text-white text-xs tracking-wide whitespace-nowrap border-r border-blue-400/30 last:border-r-0", className)} {...props} />
);
export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-3 py-2 align-middle text-sm border-r border-slate-100 dark:border-slate-800 last:border-r-0", className)} {...props} />
);
