"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Loader2, Search, CreditCard, Download, Printer, FileDown } from "lucide-react";
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
