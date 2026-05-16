"use client";
import { useState } from "react";
import { Printer, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintListButton({ className }: { className?: string }) {
  return (
    <Button
      variant="outline"
      className={className}
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" />
      列印
    </Button>
  );
}

export function PDFExportButton({
  title,
  filename,
  className,
}: {
  title: string;
  filename: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  async function handleExport() {
    setLoading(true);
    try {
      const { exportPageToPDF } = await import("@/lib/export-pdf");
      await exportPageToPDF(title, filename);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button variant="outline" className={className} onClick={handleExport} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      PDF
    </Button>
  );
}
