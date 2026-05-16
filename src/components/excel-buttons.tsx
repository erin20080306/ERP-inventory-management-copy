"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** 匯出 Excel 按鈕：透過呼叫 onExport callback (內部執行 fetch + downloadExcel) */
export function ExportExcelButton({
  label = "匯出 Excel",
  onExport,
}: {
  label?: string;
  onExport: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onExport();
          toast.success("已匯出 Excel");
        } catch (e: any) {
          toast.error(e.message || "匯出失敗");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
      {label}
    </Button>
  );
}

/** 匯入 Excel 按鈕：選檔後執行 onImport callback */
export function ImportExcelButton({
  label = "匯入 Excel",
  onImport,
  templateHeaders,
  templateName,
}: {
  label?: string;
  onImport: (rows: Record<string, any>[]) => Promise<{ success: number; failed: number; errors?: string[] }>;
  templateHeaders?: string[];
  templateName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { readExcelFile } = await import("@/lib/excel");
      const rows = await readExcelFile(file);
      if (rows.length === 0) {
        toast.error("檔案無資料");
        return;
      }
      const r = await onImport(rows);
      if (r.failed > 0) {
        toast.error(`成功 ${r.success} 筆 / 失敗 ${r.failed} 筆${r.errors?.length ? "\n" + r.errors.slice(0, 3).join("; ") : ""}`);
      } else {
        toast.success(`已匯入 ${r.success} 筆`);
      }
    } catch (err: any) {
      toast.error(err.message || "匯入失敗");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function downloadTemplate() {
    if (!templateHeaders) return;
    const { downloadExcelTemplate } = await import("@/lib/excel");
    downloadExcelTemplate(templateName ?? "template", "資料", templateHeaders);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFile}
      />
      <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {label}
      </Button>
      {templateHeaders && (
        <Button variant="ghost" size="sm" onClick={downloadTemplate}>
          範本
        </Button>
      )}
    </div>
  );
}
