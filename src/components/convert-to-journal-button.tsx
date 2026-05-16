"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

type SourceType = "PURCHASE" | "SALES" | "PURCHASE_RETURN" | "SALES_RETURN" | "RECEIVE_PAYMENT" | "SUPPLIER_PAYMENT" | "INVOICE";

export function ConvertToJournalButton({
  sourceType,
  sourceId,
  label = "轉傳票",
  variant = "outline",
  size,
}: {
  sourceType: SourceType;
  sourceId: string;
  label?: string;
  variant?: any;
  size?: any;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch("/api/accounting/journals/from-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "生成草稿失敗");
      const draft = await res.json();
      sessionStorage.setItem("journal_draft", JSON.stringify(draft));
      window.location.href = "/accounting/journals?fromSource=1";
    } catch (e: any) {
      toast.error(e.message || "操作失敗");
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} disabled={busy} onClick={handleClick}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
      {label}
    </Button>
  );
}
