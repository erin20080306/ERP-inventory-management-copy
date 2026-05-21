"use client";
import { useEffect, useState } from "react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/export-button";
import { PrintListButton, PDFExportButton } from "@/components/print-list-button";
import { Loader2, Search } from "lucide-react";
import { requireTenantId } from "@/lib/api";

export default function InventoryClient() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function load() {
    setLoading(true);
    try {
      const tenantId = await requireTenantId();
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      
      const [sRes, tRes] = await Promise.all([
        fetch(`/api/inventory/stocks?q=${encodeURIComponent(q)}`),
        fetch(`/api/inventory/transactions?${params}`),
      ]);
      const sData = await sRes.json();
      const tData = await tRes.json();
      setStocks(sData.items || []);
      setTxns(tData.items || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [q, fromDate, toDate]);

  const txnLabel: Record<string, string> = {
    PURCHASE_IN: "採購入庫",
    SALES_OUT: "銷售出庫",
    SALES_RETURN_IN: "銷售退貨入庫",
    PURCHASE_RETURN_OUT: "採購退貨出庫",
    ADJUST_IN: "盤盈",
    ADJUST_OUT: "盤虧",
    TRANSFER_IN: "調撥入庫",
    TRANSFER_OUT: "調撥出庫",
    MANUAL: "手動調整",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋 SKU / 商品名稱" className="pl-9 w-72" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
        <PDFExportButton title="庫存管理" filename="inventory" />
        <PrintListButton />
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>即時庫存</CardTitle>
              <ExportButton
                filename="inventory-stocks"
                rows={stocks.map((s: any) => ({
                  warehouse: s.warehouse.name,
                  sku: s.product.sku,
                  name: s.product.name,
                  quantity: Number(s.quantity),
                  safetyStock: Number(s.product.safetyStock),
                  costPrice: Number(s.product.costPrice),
                  value: Number(s.quantity) * Number(s.product.costPrice),
                }))}
                columns={[
                  { key: "warehouse", title: "倉庫" },
                  { key: "sku", title: "SKU" },
                  { key: "name", title: "商品名稱" },
                  { key: "quantity", title: "數量" },
                  { key: "safetyStock", title: "安全庫存" },
                  { key: "costPrice", title: "成本" },
                  { key: "value", title: "庫存價值" },
                ]}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>倉庫</TH>
                    <TH>SKU</TH>
                    <TH>商品</TH>
                    <TH>數量</TH>
                    <TH>安全庫存</TH>
                    <TH>成本</TH>
                    <TH>庫存價值</TH>
                    <TH>狀態</TH>
                  </TR>
                </THead>
                <TBody>
                  {stocks.length === 0 && (
                    <TR>
                      <TD colSpan={8} className="text-center text-muted-foreground">尚無庫存</TD>
                    </TR>
                  )}
                  {stocks.map((s: any) => {
                    const qty = Number(s.quantity);
                    const safe = Number(s.product.safetyStock);
                    return (
                      <TR key={s.id}>
                        <TD>{s.warehouse.name}</TD>
                        <TD className="font-mono text-xs">{s.product.sku}</TD>
                        <TD>{s.product.name}</TD>
                        <TD className={qty < safe ? "text-red-600 font-medium" : ""}>{formatNumber(qty)}</TD>
                        <TD>{formatNumber(safe)}</TD>
                        <TD>{formatMoney(s.product.costPrice)}</TD>
                        <TD>{formatMoney(qty * Number(s.product.costPrice))}</TD>
                        <TD>{qty < safe ? <Badge variant="warning">低庫存</Badge> : <Badge variant="success">正常</Badge>}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>近期庫存異動</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>時間</TH>
                    <TH>倉庫</TH>
                    <TH>SKU</TH>
                    <TH>商品</TH>
                    <TH>類型</TH>
                    <TH>數量</TH>
                    <TH>備註</TH>
                  </TR>
                </THead>
                <TBody>
                  {txns.length === 0 && (
                    <TR>
                      <TD colSpan={7} className="text-center text-muted-foreground">尚無資料</TD>
                    </TR>
                  )}
                  {txns.map((t: any) => (
                    <TR key={t.id}>
                      <TD className="text-xs">{formatDateTime(t.createdAt)}</TD>
                      <TD>{t.warehouse.name}</TD>
                      <TD className="font-mono text-xs">{t.product.sku}</TD>
                      <TD>{t.product.name}</TD>
                      <TD>{txnLabel[t.type] ?? t.type}</TD>
                      <TD className={Number(t.quantity) < 0 ? "text-red-600" : "text-emerald-600"}>
                        {Number(t.quantity) > 0 ? "+" : ""}
                        {formatNumber(Number(t.quantity))}
                      </TD>
                      <TD>{t.remark ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
