"use client";
import { useEffect, useState } from "react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/export-button";
import { PrintListButton, PDFExportButton } from "@/components/print-list-button";
import { Search } from "lucide-react";
import { useCustomColumns, useCustomFieldValues, CustomColumnDialog, CustomColumnButton, CustomFieldGridCell } from "@/components/custom-columns";
import { readSessionCache, TableHint, TableSkeletonRows, useColumnDrag, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";

export default function InventoryClient() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [txnsLoading, setTxnsLoading] = useState(true);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const customCols = useCustomColumns("inventory");
  const customFieldValues = useCustomFieldValues("inventory", stocks.map((stock) => stock.id));
  const colDrag = useColumnDrag("inventory", ["warehouse", "sku", "product", "quantity", "safetyStock", "cost", "value", "stockStatus"]);

  function buildParams() {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params;
  }

  async function loadStocks() {
    const params = buildParams();
    const cacheKey = `inventory:stocks:${params.toString()}`;
    const cached = readSessionCache<any[]>(cacheKey);
    if (cached) {
      setStocks(cached);
      setStocksLoading(false);
    } else {
      setStocksLoading(true);
    }
    try {
      const res = await fetch(`/api/inventory/stocks?${params}`);
      const data = await res.json();
      const items = data.items || [];
      setStocks(items);
      writeSessionCache(cacheKey, items);
    } finally {
      setStocksLoading(false);
    }
  }

  async function loadTxns() {
    const params = buildParams();
    const cacheKey = `inventory:txns:${params.toString()}`;
    const cached = readSessionCache<any[]>(cacheKey);
    if (cached) {
      setTxns(cached);
      setTxnsLoading(false);
    } else {
      setTxnsLoading(true);
    }
    try {
      const res = await fetch(`/api/inventory/transactions?${params}`);
      const data = await res.json();
      const items = data.items || [];
      setTxns(items);
      writeSessionCache(cacheKey, items);
    } finally {
      setTxnsLoading(false);
    }
  }
  useEffect(() => { loadStocks(); loadTxns(); }, [debouncedQ, fromDate, toDate]);

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
        <CustomColumnButton onClick={() => customCols.setOpen(true)} />
      </div>

      <TableHint />

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
                    <TH {...colDrag.thProps("warehouse")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>倉庫</TH>
                    <TH {...colDrag.thProps("sku")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>SKU</TH>
                    <TH {...colDrag.thProps("product")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>商品</TH>
                    <TH {...colDrag.thProps("quantity")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>數量</TH>
                    <TH {...colDrag.thProps("safetyStock")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>安全庫存</TH>
                    <TH {...colDrag.thProps("cost")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>成本</TH>
                    <TH {...colDrag.thProps("value")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>庫存價值</TH>
                    <TH {...colDrag.thProps("stockStatus")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>狀態</TH>
                    {customCols.columns.map((cc) => <TH key={cc.id} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title="按右鍵管理自訂欄位">{cc.label}</TH>)}
                  </TR>
                </THead>
                <TBody>
                  {stocksLoading && stocks.length === 0 && <TableSkeletonRows columns={8 + customCols.columns.length} />}
                  {!stocksLoading && stocks.length === 0 && (
                    <TR>
                      <TD colSpan={8 + customCols.columns.length} className="text-center text-muted-foreground">尚無庫存</TD>
                    </TR>
                  )}
                  {stocks.map((s: any, rowIndex: number) => {
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
                        {customCols.columns.map((cc, columnIndex) => { const v = customFieldValues.getValues(s.id); return <TD key={cc.id}><CustomFieldGridCell gridId="inventory-stocks" rowId={s.id} rowIndex={rowIndex} column={cc} columnIndex={columnIndex} rowIds={stocks.map((stock) => stock.id)} columns={customCols.columns} value={v[cc.id] ?? ""} saveValues={customFieldValues.saveValues} onManageColumns={() => customCols.setOpen(true)} /></TD>; })}
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
                  {txnsLoading && txns.length === 0 && <TableSkeletonRows columns={7} />}
                  {!txnsLoading && txns.length === 0 && (
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
      <CustomColumnDialog module="inventory" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}
