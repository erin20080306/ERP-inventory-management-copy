"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export function ReportDateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  function apply() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/reports?${params.toString()}`);
  }

  function clear() {
    setFrom("");
    setTo("");
    router.push("/reports");
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <span className="text-sm font-medium">日期篩選：</span>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
      <span className="text-sm text-muted-foreground">至</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
      <Button size="sm" onClick={apply}><Search className="h-4 w-4 mr-1" />查詢</Button>
      {(from || to) && <Button size="sm" variant="outline" onClick={clear}>清除</Button>}
    </div>
  );
}
