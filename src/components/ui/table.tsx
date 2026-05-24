import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="relative w-full overflow-auto rounded-lg border border-border bg-card shadow-sm">
    <table className={cn("w-full min-w-max border-separate border-spacing-0 text-sm", className)} {...props} />
  </div>
);
export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("sticky top-0 z-10 bg-muted/80 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/70", className)} {...props} />
);
export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("bg-card [&_tr:last-child_td]:border-b-0", className)} {...props} />
);
export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("group transition-colors hover:bg-muted/45 data-[state=selected]:bg-muted", className)} {...props} />
);
export const TH = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-10 whitespace-nowrap border-b border-r border-border/70 px-3 text-left text-xs font-semibold text-muted-foreground last:border-r-0", className)} {...props} />
);
export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("border-b border-r border-border/60 px-3 py-2.5 align-middle text-sm last:border-r-0", className)} {...props} />
);
