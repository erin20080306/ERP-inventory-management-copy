"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";

const typeLabel: Record<string, string> = { CHECKING: "甲存", SAVINGS: "乙存", TIME_DEPOSIT: "定存", FOREIGN: "外幣" };

function BankAccountDialog({ open, onClose, row, onSaved }: any) {
  const [form, setForm] = useState<any>({ code: "", name: "", bankName: "", accountNumber: "", accountType: "SAVINGS", branchName: "", swift: "", balance: 0, isActive: true });
  useEffect(() => {
    setForm(row ?? { code: "", name: "", bankName: "", accountNumber: "", accountType: "SAVINGS", branchName: "", swift: "", balance: 0, isActive: true });
  }, [row, open]);
  async function save() {
    try {
      const res = await fetch(row ? `/api/accounting/bank-accounts/${row.id}` : "/api/accounting/bank-accounts", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, balance: Number(form.balance) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "編輯銀行帳戶" : "新增銀行帳戶"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>帳戶編號 *</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className="space-y-1"><Label>帳戶名稱 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>銀行名稱</Label><Input value={form.bankName ?? ""} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
          <div className="space-y-1"><Label>銀行帳號</Label><Input value={form.accountNumber ?? ""} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>帳戶類型</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
              <option value="CHECKING">甲存（支票存款）</option>
              <option value="SAVINGS">乙存（活期存款）</option>
              <option value="TIME_DEPOSIT">定存</option>
              <option value="FOREIGN">外幣</option>
            </select>
          </div>
          <div className="space-y-1"><Label>分行名稱</Label><Input value={form.branchName ?? ""} onChange={(e) => setForm({ ...form, branchName: e.target.value })} /></div>
          <div className="space-y-1"><Label>SWIFT 代碼</Label><Input value={form.swift ?? ""} onChange={(e) => setForm({ ...form, swift: e.target.value })} /></div>
          <div className="space-y-1"><Label>期初餘額</Label><Input type="number" step="0.01" value={form.balance ?? 0} onChange={(e) => setForm({ ...form, balance: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />啟用</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={save}>儲存</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CashBankClient() {
  const [cash, setCash] = useState<any[]>([]);
  const [bank, setBank] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBank, setEditBank] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const [cRes, bRes] = await Promise.all([
        fetch("/api/accounting/cash-accounts"),
        fetch("/api/accounting/bank-accounts"),
      ]);
      const cData = await cRes.json();
      const bData = await bRes.json();
      setCash(cData.items ?? []);
      setBank(bData.items ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  async function deleteBank(id: string) {
    if (!confirm("確定刪除此銀行帳戶？")) return;
    try {
      const res = await fetch(`/api/accounting/bank-accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "刪除失敗");
      toast.success("已刪除");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>現金帳戶</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>編號</TH><TH>名稱</TH><TH>餘額</TH></TR></THead>
              <TBody>
                {cash.map((c: any) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-xs">{c.code}</TD>
                    <TD>{c.name}</TD>
                    <TD>{formatMoney(c.balance)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>銀行帳戶</CardTitle>
              <Button size="sm" onClick={() => setEditBank({})}>
                <Plus className="h-4 w-4" />
                新增
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>編號</TH><TH>名稱</TH><TH>類型</TH><TH>銀行</TH><TH>帳號</TH><TH>餘額</TH><TH>操作</TH></TR></THead>
              <TBody>
                {bank.map((b: any) => (
                  <TR key={b.id}>
                    <TD className="font-mono text-xs">{b.code}</TD>
                    <TD>{b.name}</TD>
                    <TD>{typeLabel[b.accountType] ?? "—"}</TD>
                    <TD>{b.bankName ?? "—"}{b.branchName ? ` / ${b.branchName}` : ""}</TD>
                    <TD className="font-mono text-xs">{b.accountNumber ?? "—"}</TD>
                    <TD>{formatMoney(b.balance)}</TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditBank(b)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteBank(b.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {editBank && <BankAccountDialog open={!!editBank} row={editBank.id ? editBank : null} onClose={() => setEditBank(null)} onSaved={() => { setEditBank(null); setRefreshKey((k) => k + 1); }} />}
    </div>
  );
}
