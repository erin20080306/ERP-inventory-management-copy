"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatMoney, formatNumber, formatDate } from "@/lib/utils";
import { Loader2, Search, Download, FileDown, Printer } from "lucide-react";
import { downloadCSV, toCSV } from "@/lib/csv";
import { toast } from "sonner";

export default function OverviewClient() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const pageSize = 20;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/products/overview?${params.toString()}`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [page, q, fromDate, toDate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋 SKU / 商品名稱" className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        <Button variant="outline" onClick={async () => {
          const params = new URLSearchParams({ q, pageSize: "10000" });
          if (fromDate) params.set("from", fromDate);
          if (toDate) params.set("to", toDate);
          const res = await fetch(`/api/products/overview?${params}`);
          const d = await res.json();
          const csv = toCSV(d.items, [
            { key: "sku", title: "SKU" },
            { key: "name", title: "商品名稱" },
            { key: "category", title: "類別" },
            { key: "totalStock", title: "總庫存" },
            { key: "salesQuantity", title: "銷售數量" },
            { key: "salesAmount", title: "銷售金額" },
            { key: "grossProfit", title: "毛利" },
            { key: "grossMargin", title: "毛利率", get: (r: any) => r.grossMargin.toFixed(1) + "%" },
          ]);
          downloadCSV(`product-overview-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          toast.success("已匯出 CSV");
        }}><Download className="h-4 w-4" />CSV</Button>
        <Button variant="outline" onClick={async () => {
          const params = new URLSearchParams({ q, pageSize: "10000" });
          if (fromDate) params.set("from", fromDate);
          if (toDate) params.set("to", toDate);
          const res = await fetch(`/api/products/overview?${params}`);
          const d = await res.json();
          const { downloadExcel } = await import("@/lib/excel");
          downloadExcel("product-overview", "商品總覽", d.items, [
            { key: "sku", title: "SKU" },
            { key: "name", title: "商品名稱" },
            { key: "category", title: "類別" },
            { key: "costPrice", title: "成本" },
            { key: "salePrice", title: "售價" },
            { key: "totalStock", title: "總庫存" },
            { key: "salesQuantity", title: "銷售數量" },
            { key: "salesAmount", title: "銷售金額" },
            { key: "purchaseQuantity", title: "採購數量" },
            { key: "purchaseAmount", title: "採購金額" },
            { key: "grossProfit", title: "毛利" },
            { key: "grossMargin", title: "毛利率", get: (r: any) => r.grossMargin.toFixed(1) + "%" },
          ]);
          toast.success("已匯出 Excel");
        }}><FileDown className="h-4 w-4" />Excel</Button>
        <Button variant="outline" onClick={async () => {
          const { exportPageToPDF } = await import("@/lib/export-pdf");
          await exportPageToPDF("商品總覽", "product-overview");
        }}><Printer className="h-4 w-4" />PDF</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>SKU</TH>
                <TH>商品名稱</TH>
                <TH>規格</TH>
                <TH>類別</TH>
                <TH>單位</TH>
                <TH>成本</TH>
                <TH>售價</TH>
                <TH>總庫存</TH>
                <TH>銷售數量</TH>
                <TH>銷售金額</TH>
                <TH>採購數量</TH>
                <TH>採購金額</TH>
                <TH>毛利</TH>
                <TH>毛利率</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD className="font-mono text-xs">{item.sku}</TD>
                  <TD>{item.name}</TD>
                  <TD>{item.spec || "-"}</TD>
                  <TD>{item.category || "-"}</TD>
                  <TD>{item.unit || "-"}</TD>
                  <TD>{formatMoney(item.costPrice)}</TD>
                  <TD>{formatMoney(item.salePrice)}</TD>
                  <TD>{formatNumber(item.totalStock)}</TD>
                  <TD>{formatNumber(item.salesQuantity)}</TD>
                  <TD>{formatMoney(item.salesAmount)}</TD>
                  <TD>{formatNumber(item.purchaseQuantity)}</TD>
                  <TD>{formatMoney(item.purchaseAmount)}</TD>
                  <TD className={item.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}>{formatMoney(item.grossProfit)}</TD>
                  <TD className={item.grossMargin >= 0 ? "text-emerald-600" : "text-red-600"}>{item.grossMargin.toFixed(1)}%</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {Math.ceil(total / pageSize) > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一頁</Button>
          <span className="text-sm">{page} / {Math.ceil(total / pageSize)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)}>下一頁</Button>
        </div>
      )}
    </div>
  );
}
