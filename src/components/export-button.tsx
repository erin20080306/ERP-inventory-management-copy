"use client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV, toCSV } from "@/lib/csv";
import { useTranslations } from "next-intl";

export function ExportButton({
  filename,
  rows,
  columns,
  label,
}: {
  filename: string;
  rows: any[];
  columns: { key: string; title: string; get?: (r: any) => any }[];
  label?: string;
}) {
  const t = useTranslations("table");
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        const csv = toCSV(rows, columns);
        downloadCSV(`${filename}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
        toast.success(t("exportedCsv"));
      }}
    >
      <Download className="h-4 w-4" />
      {label ?? t("exportCsv")}
    </Button>
  );
}
