"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Loader2, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Suggestion = {
  productId: string;
  sku: string;
  name: string;
  spec: string | null;
  onHand: number;
  onOrder: number;
  avgDailyDemand: number;
  daysOfCover: number | null;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  suggestedQty: number;
  costPrice: number;
  estimatedCost: number;
  supplierId: string | null;
  supplierName: string;
  urgency: "critical" | "warning" | "ok";
  reason: string;
};

type Group = { supplierId: string; supplierName: string; items: Suggestion[]; totalQty: number; estimatedCost: number };

type ApiResponse = {
  generatedAt: string;
  params: { demandWindowDays: number; reviewDays: number };
  summary: {
    itemCount: number;
    criticalCount: number;
    totalSuggestedQty: number;
    estimatedCost: number;
    supplierGroupCount: number;
    noSupplierCount: number;
  };
  groups: Group[];
  unassigned: Suggestion[];
};

const money = (n: number) => "NT$ " + Math.round(n).toLocaleString("zh-TW");
const urgencyLabel: Record<Suggestion["urgency"], { text: string; variant: any }> = {
  critical: { text: "急需", variant: "destructive" },
  warning: { text: "偏低", variant: "secondary" },
  ok: { text: "正常", variant: "outline" },
};

export function ReorderClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [windowDays, setWindowDays] = useState(30);
  const [reviewDays, setReviewDays] = useState(7);

  // 使用者調整過的採購量 / 取消勾選的品項
  const [qtyOverride, setQtyOverride] = useState<Record<string, number>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchases/suggestions?windowDays=${windowDays}&reviewDays=${reviewDays}`);
      if (!res.ok) throw new Error((await res.json()).error || "載入補貨建議失敗");
      const json: ApiResponse = await res.json();
      setData(json);
      setQtyOverride({});
      setExcluded({});
    } catch (e: any) {
      toast.error(e.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [windowDays, reviewDays]);

  useEffect(() => {
    load();
  }, [load]);

  const qtyOf = (s: Suggestion) => qtyOverride[s.productId] ?? s.suggestedQty;

  const selectedByGroup = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const g of data?.groups ?? []) {
      const picked = g.items.filter((s) => !excluded[s.productId] && qtyOf(s) > 0);
      if (picked.length) map.set(g.supplierId, picked);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, excluded, qtyOverride]);

  const selectedCount = Array.from(selectedByGroup.values()).reduce((sum, arr) => sum + arr.length, 0);
  const selectedCost = Array.from(selectedByGroup.values())
    .flat()
    .reduce((sum, s) => sum + qtyOf(s) * s.costPrice, 0);

  async function generateDrafts() {
    if (selectedCount === 0) {
      toast.error("沒有勾選任何品項");
      return;
    }
    setSubmitting(true);
    try {
      const orders = Array.from(selectedByGroup.entries()).map(([supplierId, items]) => ({
        supplierId,
        items: items.map((s) => ({ productId: s.productId, quantity: qtyOf(s), unitPrice: s.costPrice })),
      }));
      const res = await fetch("/api/purchases/auto-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "生成採購草稿失敗");
      const result = await res.json();
      toast.success(result.message || `已建立 ${result.createdCount} 張採購草稿`);
      window.location.href = "/purchases";
    } catch (e: any) {
      toast.error(e.message || "操作失敗");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 控制列 */}
      <div className="flex flex-wrap items-end gap-3">
        <NumField label="需求觀察期(天)" value={windowDays} onChange={setWindowDays} min={7} max={365} />
        <NumField label="補貨週期(天)" value={reviewDays} onChange={setReviewDays} min={1} max={180} />
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新計算
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            已選 <b>{selectedCount}</b> 項・約 {money(selectedCost)}
          </span>
          <Button onClick={generateDrafts} disabled={submitting || selectedCount === 0}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            一鍵生成採購草稿
          </Button>
        </div>
      </div>

      {/* 摘要卡 */}
      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="建議補貨品項" value={`${data.summary.itemCount} 項`} />
          <Stat label="急需補貨" value={`${data.summary.criticalCount} 項`} highlight={data.summary.criticalCount > 0} />
          <Stat label="預估採購金額" value={money(data.summary.estimatedCost)} />
          <Stat label="涉及供應商" value={`${data.summary.supplierGroupCount} 家`} />
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在分析銷售與庫存…
        </div>
      )}

      {data && data.groups.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">目前沒有需要補貨的品項 🎉</CardContent>
        </Card>
      )}

      {/* 依供應商分組 */}
      {data?.groups.map((g) => (
        <Card key={g.supplierId}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {g.supplierName}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{g.items.length} 項</span>
            </CardTitle>
            <span className="text-sm text-muted-foreground">預估 {money(g.estimatedCost)}</span>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>選</TH>
                  <TH>SKU / 品名</TH>
                  <TH>狀態</TH>
                  <TH className="text-right">現貨</TH>
                  <TH className="text-right">在途</TH>
                  <TH className="text-right">日均</TH>
                  <TH className="text-right">再訂購點</TH>
                  <TH className="text-right">建議量</TH>
                  <TH className="text-right">預估金額</TH>
                </TR>
              </THead>
              <TBody>
                {g.items.map((s) => {
                  const q = qtyOf(s);
                  const off = !!excluded[s.productId] || q <= 0;
                  return (
                    <TR key={s.productId} className={off ? "opacity-40" : ""}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={!excluded[s.productId]}
                          onChange={(e) => setExcluded((p) => ({ ...p, [s.productId]: !e.target.checked }))}
                        />
                      </TD>
                      <TD>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground" title={s.reason}>
                          {s.sku}
                          {s.spec ? ` · ${s.spec}` : ""}・前置期 {s.leadTimeDays} 天
                        </div>
                      </TD>
                      <TD>
                        <Badge variant={urgencyLabel[s.urgency].variant}>{urgencyLabel[s.urgency].text}</Badge>
                      </TD>
                      <TD className="text-right">{s.onHand}</TD>
                      <TD className="text-right">{s.onOrder || "—"}</TD>
                      <TD className="text-right">{s.avgDailyDemand}</TD>
                      <TD className="text-right">{s.reorderPoint}</TD>
                      <TD className="text-right">
                        <input
                          type="number"
                          className="w-20 rounded border px-2 py-1 text-right"
                          value={q}
                          min={0}
                          onChange={(e) => setQtyOverride((p) => ({ ...p, [s.productId]: Math.max(0, Number(e.target.value)) }))}
                        />
                      </TD>
                      <TD className="text-right">{money(q * s.costPrice)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* 無對應供應商、無法自動開單 */}
      {data && data.unassigned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <AlertTriangle className="h-4 w-4" /> {data.unassigned.length} 項缺少供應商，無法自動開單
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            這些品項沒有採購紀錄也未設定偏好供應商，請先到商品設定「偏好供應商」後再重新計算：
            <div className="mt-2 flex flex-wrap gap-2">
              {data.unassigned.slice(0, 30).map((s) => (
                <Badge key={s.productId} variant="outline">
                  {s.sku} {s.name}（建議 {s.suggestedQty}）
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold ${highlight ? "text-red-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        className="w-28 rounded border px-2 py-1 text-sm text-foreground"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      />
    </label>
  );
}
