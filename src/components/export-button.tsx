"use client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV, toCSV } from "@/lib/csv";

export function ExportButton({
  filename,
  rows,
  columns,
  label = "匯出 CSV",
}: {
  filename: string;
  rows: any[];
  columns: { key: string; title: string; get?: (r: any) => any }[];
  label?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        const csv = toCSV(rows, columns);
        downloadCSV(`${filename}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
        toast.success("已匯出 CSV");
      }}
    >
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}
