"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Loader2, Search, CreditCard, Download, Printer, FileDown, ListChecks } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { ConvertToJournalButton } from "@/components/convert-to-journal-button";

export function LedgerClient({ kind }: { kind: "ar" | "ap" }) {
  const endpoint = kind === "ar" ? "/api/accounting/receivables" : "/api/accounting/payables";
  const partyLabel = kind === "ar" ? "客戶" : "供應商";
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [pay, setPay] = useState<any>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pageSize = 20;

  async function load() {
    setLoading(true);
    const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
    const d = await res.json();
    setRows(d.items);
    setTotal(d.total);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder={`搜尋${partyLabel}`} className="pl-9 w-72" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <div className="flex items-center gap-2">
        <Button onClick={() => setBatchOpen(true)}>
          <ListChecks className="h-4 w-4" />
          批次沖帳
        </Button>
        <Button variant="outline" onClick={async () => {
          const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&pageSize=10000`);
          const d = await res.json();
          const { downloadExcel } = await import("@/lib/excel");
          downloadExcel(kind === "ar" ? "receivables" : "payables", kind === "ar" ? "應收帳款" : "應付帳款", d.items, [
            { key: "party", title: partyLabel, get: (r: any) => (kind === "ar" ? r.customer : r.supplier)?.companyName ?? "" },
            { key: "relNumber", title: "關聯單號", get: (r: any) => (kind === "ar" ? r.salesOrder : r.purchaseOrder)?.number ?? "" },
            { key: "createdAt", title: "日期", get: (r: any) => formatDate(r.createdAt) },
            { key: "amount", title: "金額", get: (r: any) => Number(r.amount) },
            { key: "paidAmount", title: kind === "ar" ? "已收" : "已付", get: (r: any) => Number(r.paidAmount) },
            { key: "balance", title: "未結", get: (r: any) => Number(r.amount) - Number(r.paidAmount) },
            { key: "status", title: "狀態" },
          ]);
          toast.success("已匯出 Excel");
        }}>
          <FileDown className="h-4 w-4" />
          Excel
        </Button>
        <Button variant="outline" disabled={pdfBusy} onClick={async () => {
          setPdfBusy(true);
          try { const { exportPageToPDF } = await import("@/lib/export-pdf"); await exportPageToPDF(kind === "ar" ? "應收帳款" : "應付帳款", kind === "ar" ? "receivables" : "payables"); } finally { setPdfBusy(false); }
        }}>
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          PDF
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          列印
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&pageSize=10000`);
            const d = await res.json();
            const csv = toCSV(d.items, [
              { key: "party", title: partyLabel, get: (r: any) => (kind === "ar" ? r.customer : r.supplier)?.companyName ?? "" },
              { key: "relNumber", title: "關聯單號", get: (r: any) => (kind === "ar" ? r.salesOrder : r.purchaseOrder)?.number ?? "" },
              { key: "createdAt", title: "日期", get: (r: any) => formatDate(r.createdAt) },
              { key: "amount", title: "金額" },
              { key: "paidAmount", title: kind === "ar" ? "已收金額" : "已付金額" },
              { key: "balance", title: "未結", get: (r: any) => Number(r.amount) - Number(r.paidAmount) },
              { key: "status", title: "狀態" },
            ]);
            downloadCSV(`${kind === "ar" ? "receivables" : "payables"}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            toast.success("已匯出 CSV");
          }}
        >
          <Download className="h-4 w-4" />
          匯出 CSV
        </Button>
        </div>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>{partyLabel}</TH><TH>關聯單號</TH><TH>日期</TH><TH>金額</TH><TH>已{kind === "ar" ? "收" : "付"}</TH><TH>未結</TH><TH>狀態</TH><TH className="w-24 text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={8} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
          {!loading && rows.length === 0 && <TR><TD colSpan={8}><EmptyState /></TD></TR>}
          {!loading && rows.map((r) => {
            const party = kind === "ar" ? r.customer : r.supplier;
            const rel = kind === "ar" ? r.salesOrder : r.purchaseOrder;
            const balance = Number(r.amount) - Number(r.paidAmount);
            return (
              <TR key={r.id}>
                <TD>{party?.companyName ?? "—"}</TD>
                <TD className="font-mono text-xs">{rel?.number ?? "—"}</TD>
                <TD>{formatDate(r.createdAt)}</TD>
                <TD>{formatMoney(r.amount)}</TD>
                <TD>{formatMoney(r.paidAmount)}</TD>
                <TD className={balance > 0 ? "text-red-600 font-medium" : ""}>{formatMoney(balance)}</TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD className="text-right">
                  {balance > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setPay(r)}>
                      <CreditCard className="h-4 w-4" />
                      {kind === "ar" ? "收款" : "付款"}
                    </Button>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>共 {total} 筆</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一頁</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一頁</Button>
        </div>
      </div>
      {pay && <PayDialog row={pay} kind={kind} onClose={() => setPay(null)} onDone={() => { setPay(null); load(); }} />}
      {batchOpen && <BatchPayDialog kind={kind} onClose={() => setBatchOpen(false)} onDone={() => { setBatchOpen(false); load(); }} />}
    </div>
  );
}

function PayDialog({ row, kind, onClose, onDone }: any) {
  const balance = Number(row.amount) - Number(row.paidAmount);
  const [amount, setAmount] = useState(balance);
  const [discount, setDiscount] = useState(0);
  const [discountNote, setDiscountNote] = useState("");
  const [method, setMethod] = useState("CASH");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedPayment, setSavedPayment] = useState<{ paymentId: string; discountId?: string } | null>(null);
  const endpoint = kind === "ar" ? "/api/accounting/receivables" : "/api/accounting/payables";
  const totalWriteOff = Number(amount) + Number(discount);
  async function save() {
    if (Number(amount) <= 0 && Number(discount) <= 0) return toast.error("收款金額或折讓金額至少填一項");
    if (totalWriteOff > balance) return toast.error("收款 + 折讓不可大於未結款項");
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [kind === "ar" ? "receivableId" : "payableId"]: row.id,
          amount: Number(amount),
          discount: Number(discount),
          discountNote,
          method,
          remark,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失敗");
      const result = await res.json();
      toast.success("已處理");
      if (result.paymentId || result.discountId) {
        setSavedPayment({ paymentId: result.paymentId, discountId: result.discountId });
      } else {
        onDone();
      }
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{kind === "ar" ? "沖應收帳款" : "沖應付帳款"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">未結金額：<span className="font-bold text-red-600">{formatMoney(balance)}</span></div>
          <div className="space-y-1"><Label>{kind === "ar" ? "收款金額" : "付款金額"}</Label><Input inputMode="decimal" className="[appearance:textfield]" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0" /></div>
          <div className="space-y-1">
            <Label>方式</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">現金</option>
              <option value="BANK">銀行轉帳</option>
              <option value="CHEQUE">支票</option>
            </select>
          </div>
          <hr className="border-dashed" />
          <div className="space-y-1"><Label>折讓金額（差額部分）</Label><Input inputMode="decimal" className="[appearance:textfield]" value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0" /></div>
          <div className="space-y-1"><Label>折讓原因</Label><Input value={discountNote} onChange={(e) => setDiscountNote(e.target.value)} placeholder="例: 數量短少 / 品質折讓" /></div>
          <hr className="border-dashed" />
          <div className="space-y-1"><Label>備註</Label><Input value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
          <div className="text-sm text-muted-foreground">沖帳合計：{formatMoney(totalWriteOff)}（收款 {formatMoney(amount)} + 折讓 {formatMoney(discount)}）</div>
        </div>
        <DialogFooter>
          {savedPayment ? (
            <div className="flex items-center gap-2 flex-wrap w-full justify-end">
              {savedPayment.discountId && (
                <Button variant="outline" size="sm" onClick={() => window.open(`/print/discount/${savedPayment.discountId}`, "_blank")}>
                  列印折讓單
                </Button>
              )}
              <ConvertToJournalButton
                sourceType={kind === "ar" ? "RECEIVE_PAYMENT" : "SUPPLIER_PAYMENT"}
                sourceId={savedPayment.paymentId}
                label="轉傳票"
              />
              <Button variant="ghost" onClick={onDone}>完成</Button>
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={save} disabled={saving}>{saving ? "處理中..." : "確認沖帳"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 批次沖帳（先輸入實收/實付金額 → 選帳單 → 差額=折讓）───
function BatchPayDialog({ kind, onClose, onDone }: { kind: "ar" | "ap"; onClose: () => void; onDone: () => void }) {
  const endpoint = kind === "ar" ? "/api/accounting/receivables" : "/api/accounting/payables";
  const partyEndpoint = kind === "ar" ? "/api/customers" : "/api/suppliers";
  const partyLabel = kind === "ar" ? "客戶" : "供應商";
  const partyIdKey = kind === "ar" ? "customerId" : "supplierId";
  const payLabel = kind === "ar" ? "實收金額" : "實付金額";

  const [parties, setParties] = useState<any[]>([]);
  const [partyId, setPartyId] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [totalPay, setTotalPay] = useState<number>(0);
  const [method, setMethod] = useState("CASH");
  const [discountAsWriteOff, setDiscountAsWriteOff] = useState(false);
  const [discountReason, setDiscountReason] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  useEffect(() => {
    fetch(`${partyEndpoint}?pageSize=1000`).then((r) => r.json()).then((d) => setParties(d.items ?? []));
  }, [partyEndpoint]);

  useEffect(() => {
    if (!partyId) { setItems([]); return; }
    setLoadingItems(true);
    setSelected(new Set());
    setTotalPay(0);
    fetch(`${endpoint}?${partyIdKey}=${partyId}&status=PENDING&pageSize=1000`)
      .then((r) => r.json())
      .then((d) => {
        return fetch(`${endpoint}?${partyIdKey}=${partyId}&status=PARTIAL&pageSize=1000`).then((r) => r.json()).then((d2) => {
          const all = [...(d.items ?? []), ...(d2.items ?? [])];
          setItems(all);
        });
      })
      .finally(() => setLoadingItems(false));
  }, [partyId, endpoint, partyIdKey]);

  const selectedItems = items.filter((i) => selected.has(i.id));
  const totalBalance = selectedItems.reduce((s, i) => s + Number(i.amount) - Number(i.paidAmount), 0);
  const difference = totalBalance - totalPay;
  const hasDiff = difference > 0.001;

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }

  async function save() {
    if (selectedItems.length === 0) return toast.error("請至少勾選一筆帳單");
    if (totalPay < 0) return toast.error("金額不可為負");
    if (totalPay > totalBalance) return toast.error(`${payLabel}不可大於未結總額`);
    if (hasDiff && !discountAsWriteOff) return toast.error("有差額未處理，請勾選「差額以折讓沖銷」或調整金額");
    setSaving(true);
    const batchResults: any[] = [];
    try {
      let remainPay = totalPay;
      let remainDiscount = discountAsWriteOff ? difference : 0;
      for (let idx = 0; idx < selectedItems.length; idx++) {
        const item = selectedItems[idx];
        const itemBalance = Number(item.amount) - Number(item.paidAmount);
        const isLast = idx === selectedItems.length - 1;
        // 按比例分配收款
        let itemPay: number;
        let itemDiscount: number;
        if (isLast) {
          itemPay = Math.round(remainPay * 100) / 100;
          itemDiscount = Math.round(remainDiscount * 100) / 100;
        } else {
          const ratio = totalBalance > 0 ? itemBalance / totalBalance : 0;
          itemPay = Math.round(totalPay * ratio * 100) / 100;
          itemDiscount = discountAsWriteOff ? Math.round(difference * ratio * 100) / 100 : 0;
        }
        remainPay -= itemPay;
        remainDiscount -= itemDiscount;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [kind === "ar" ? "receivableId" : "payableId"]: item.id,
            amount: itemPay,
            discount: itemDiscount > 0 ? itemDiscount : 0,
            discountNote: itemDiscount > 0 ? (discountReason || "批次沖帳差額折讓") : "",
            method,
            remark,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          batchResults.push({ id: item.id, ok: false, error: err.error });
        } else {
          const data = await res.json();
          batchResults.push({ id: item.id, ok: true, ...data });
        }
      }
      setResults(batchResults);
      const okCount = batchResults.filter((r) => r.ok).length;
      const failCount = batchResults.filter((r) => !r.ok).length;
      if (failCount === 0) toast.success(`已完成 ${okCount} 筆沖帳`);
      else toast.error(`成功 ${okCount} 筆，失敗 ${failCount} 筆`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>批次沖帳 — {kind === "ar" ? "應收帳款" : "應付帳款"}</DialogTitle></DialogHeader>

        {results ? (
          <div className="space-y-3">
            <div className="text-sm font-medium">沖帳結果</div>
            <div className="space-y-1 text-sm">
              {results.map((r, i) => {
                const item = items.find((it) => it.id === r.id);
                const rel = kind === "ar" ? item?.salesOrder : item?.purchaseOrder;
                return (
                  <div key={i} className={`flex items-center gap-2 ${r.ok ? "text-emerald-700" : "text-red-600"}`}>
                    <span>{r.ok ? "✓" : "✗"}</span>
                    <span className="font-mono">{rel?.number ?? "—"}</span>
                    <span>{r.ok ? `單號 ${r.number}` : r.error}</span>
                  </div>
                );
              })}
            </div>
            <DialogFooter><Button onClick={onDone}>完成</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Step 1: 選廠商/客戶 + 輸入實收金額 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>選擇{partyLabel}</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                  <option value="">-- 請選擇 --</option>
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.companyName}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{payLabel}</Label>
                <Input inputMode="decimal" className="[appearance:textfield] text-lg font-bold" value={totalPay || ""} onChange={(e) => setTotalPay(Number(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="例: 30000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>付款方式</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="CASH">現金</option>
                  <option value="BANK">銀行轉帳</option>
                  <option value="CHEQUE">支票</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>備註</Label>
                <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
              </div>
            </div>

            {/* Step 2: 勾選帳單 */}
            {partyId && (
              <>
                <div className="text-sm font-medium border-t pt-3">勾選要沖銷的帳單</div>
                {loadingItems ? (
                  <div className="text-center py-6"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
                ) : items.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">此{partyLabel}沒有未結帳單</div>
                ) : (
                  <div className="border rounded-md overflow-hidden max-h-[280px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0">
                        <tr>
                          <th className="p-2 w-8"><input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} /></th>
                          <th className="p-2 text-left">關聯單號</th>
                          <th className="p-2 text-left">日期</th>
                          <th className="p-2 text-right">金額</th>
                          <th className="p-2 text-right">已{kind === "ar" ? "收" : "付"}</th>
                          <th className="p-2 text-right">未結</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i) => {
                          const rel = kind === "ar" ? i.salesOrder : i.purchaseOrder;
                          const bal = Number(i.amount) - Number(i.paidAmount);
                          return (
                            <tr key={i.id} className={`border-t cursor-pointer hover:bg-muted/30 ${selected.has(i.id) ? "bg-blue-50" : ""}`} onClick={() => toggleSelect(i.id)}>
                              <td className="p-2"><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)} /></td>
                              <td className="p-2 font-mono text-xs">{rel?.number ?? "—"}</td>
                              <td className="p-2">{formatDate(i.createdAt)}</td>
                              <td className="p-2 text-right">{formatMoney(i.amount)}</td>
                              <td className="p-2 text-right">{formatMoney(i.paidAmount)}</td>
                              <td className="p-2 text-right text-red-600 font-medium">{formatMoney(bal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Step 3: 計算結果 */}
                {selectedItems.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm bg-muted/50 rounded-md p-3 space-y-1">
                      <div className="flex justify-between"><span>已勾選 {selectedItems.length} 筆，未結總額</span><span className="font-bold">{formatMoney(totalBalance)}</span></div>
                      <div className="flex justify-between"><span>{payLabel}</span><span className="font-bold">{formatMoney(totalPay)}</span></div>
                      {hasDiff && (
                        <div className="flex justify-between text-amber-600 font-medium border-t pt-1 mt-1">
                          <span>差額</span><span>{formatMoney(difference)}</span>
                        </div>
                      )}
                      {!hasDiff && totalPay > 0 && (
                        <div className="flex justify-between text-emerald-600 font-medium border-t pt-1 mt-1">
                          <span>狀態</span><span>金額剛好</span>
                        </div>
                      )}
                    </div>

                    {hasDiff && (
                      <div className="space-y-2 border border-amber-200 bg-amber-50 rounded-md p-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={discountAsWriteOff} onChange={(e) => setDiscountAsWriteOff(e.target.checked)} />
                          <span>差額 <span className="font-bold">{formatMoney(difference)}</span> 以<span className="font-bold text-amber-700">折讓</span>沖銷</span>
                        </label>
                        {discountAsWriteOff && (
                          <div className="space-y-1">
                            <Label>折讓原因</Label>
                            <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="例: 尾數差異 / 品質折讓 / 數量短少" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={save} disabled={saving || selectedItems.length === 0 || totalPay <= 0}>
                {saving ? "處理中..." : `確認沖帳 (${selectedItems.length} 筆)`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
