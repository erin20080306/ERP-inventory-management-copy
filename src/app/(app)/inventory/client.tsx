"use client";
import { useEffect, useState } from "react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatNumber, formatMoney, formatUnitPrice, formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/export-button";
import { PrintListButton, PDFExportButton } from "@/components/print-list-button";
import { Search } from "lucide-react";
import { useCustomColumns, useCustomFieldValues, CustomColumnDialog, CustomColumnButton, CustomFieldGridCell } from "@/components/custom-columns";
import { readSessionCache, TableHint, TableSkeletonRows, useColumnDrag, useDebouncedValue, writeSessionCache } from "@/components/table-helpers";
import { useTranslations } from "next-intl";

export default function InventoryClient() {
  const m = useTranslations("inventory");
  const f = useTranslations("fields");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const tPage = useTranslations("pages");
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
  const colDrag = useColumnDrag("inventory", ["warehouse", "sku", "product", "quantity", "reserved", "available", "safetyStock", "cost", "value", "stockStatus"]);

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
    PURCHASE_IN: m("purchaseIn"),
    SALES_OUT: m("salesOut"),
    SALES_RETURN_IN: m("salesReturnIn"),
    PURCHASE_RETURN_OUT: m("purchaseReturnOut"),
    ADJUST_IN: m("countSurplus"),
    ADJUST_OUT: m("countShortage"),
    TRANSFER_IN: m("transferIn"),
    TRANSFER_OUT: m("transferOut"),
    MANUAL: m("manualAdjust"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder={m("searchPlaceholder")} className="pl-9 w-72" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
        <PDFExportButton title={tPage("inventory.title")} filename="inventory" />
        <PrintListButton />
        <CustomColumnButton onClick={() => customCols.setOpen(true)} />
      </div>

      <TableHint />

      <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>{m("liveStock")}</CardTitle>
              <ExportButton
                filename="inventory-stocks"
                rows={stocks.map((s: any) => ({
                  warehouse: s.warehouse.name,
                  sku: s.product.sku,
                  name: s.product.name,
                  quantity: Number(s.quantity),
                  reservedQuantity: Number(s.reservedQuantity ?? 0),
                  availableQuantity: Number(s.availableQuantity ?? s.quantity),
                  safetyStock: Number(s.product.safetyStock),
                  costPrice: Number(s.product.costPrice),
                  value: Number(s.quantity) * Number(s.product.costPrice),
                }))}
                columns={[
                  { key: "warehouse", title: f("warehouse") },
                  { key: "sku", title: "SKU" },
                  { key: "name", title: f("productName") },
                  { key: "quantity", title: m("physicalStock") },
                  { key: "reservedQuantity", title: m("webReserved") },
                  { key: "availableQuantity", title: m("available") },
                  { key: "safetyStock", title: f("safetyStock") },
                  { key: "costPrice", title: f("cost") },
                  { key: "value", title: m("stockValue") },
                ]}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH {...colDrag.thProps("warehouse")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{f("warehouse")}</TH>
                    <TH {...colDrag.thProps("sku")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>SKU</TH>
                    <TH {...colDrag.thProps("product")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{f("product")}</TH>
                    <TH {...colDrag.thProps("quantity")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{m("physicalStock")}</TH>
                    <TH {...colDrag.thProps("reserved")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{m("webReserved")}</TH>
                    <TH {...colDrag.thProps("available")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{m("available")}</TH>
                    <TH {...colDrag.thProps("safetyStock")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{f("safetyStock")}</TH>
                    <TH {...colDrag.thProps("cost")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{f("cost")}</TH>
                    <TH {...colDrag.thProps("value")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{m("stockValue")}</TH>
                    <TH {...colDrag.thProps("stockStatus")} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }}>{tc("status")}</TH>
                    {customCols.columns.map((cc) => <TH key={cc.id} onContextMenu={(event) => { event.preventDefault(); customCols.setOpen(true); }} title={tt("rightClickColumns")}>{cc.label}</TH>)}
                  </TR>
                </THead>
                <TBody>
                  {stocksLoading && stocks.length === 0 && <TableSkeletonRows columns={10 + customCols.columns.length} />}
                  {!stocksLoading && stocks.length === 0 && (
                    <TR>
                      <TD colSpan={10 + customCols.columns.length} className="text-center text-muted-foreground">{m("noStock")}</TD>
                    </TR>
                  )}
                  {stocks.map((s: any, rowIndex: number) => {
                    const qty = Number(s.quantity);
                    const reserved = Number(s.reservedQuantity ?? 0);
                    const available = Number(s.availableQuantity ?? qty);
                    const safe = Number(s.product.safetyStock);
                    return (
                      <TR key={s.id}>
                        <TD>{s.warehouse.name}</TD>
                        <TD className="font-mono text-xs">{s.product.sku}</TD>
                        <TD>{s.product.name}</TD>
                        <TD>{formatNumber(qty)}</TD>
                        <TD className={reserved > 0 ? "font-medium text-amber-600" : "text-muted-foreground"}>{formatNumber(reserved)}</TD>
                        <TD className={available < safe ? "text-red-600 font-medium" : "font-medium text-emerald-600"}>{formatNumber(available)}</TD>
                        <TD>{formatNumber(safe)}</TD>
                        <TD>{formatUnitPrice(s.product.costPrice)}</TD>
                        <TD>{formatMoney(qty * Number(s.product.costPrice))}</TD>
                        <TD>{available < safe ? <Badge variant="warning">{m("lowStock")}</Badge> : reserved > 0 ? <Badge variant="info">{m("webReservedBadge")}</Badge> : <Badge variant="success">{m("normal")}</Badge>}</TD>
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
              <CardTitle>{m("recentMovements")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>{m("time")}</TH>
                    <TH>{f("warehouse")}</TH>
                    <TH>SKU</TH>
                    <TH>{f("product")}</TH>
                    <TH>{f("type")}</TH>
                    <TH>{tc("quantity")}</TH>
                    <TH>{tc("remark")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {txnsLoading && txns.length === 0 && <TableSkeletonRows columns={7} />}
                  {!txnsLoading && txns.length === 0 && (
                    <TR>
                      <TD colSpan={7} className="text-center text-muted-foreground">{tc("noData")}</TD>
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
